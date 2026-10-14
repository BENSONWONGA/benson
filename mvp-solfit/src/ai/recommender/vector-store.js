/**
 * ai/recommender/vector-store.js — pgvector ANN 检索层（Phase 14）
 *
 * 兑现 embeddings.js 的演进注记："目录过万后此层原位换 pgvector ANN，
 * 签名不变"，及方案 §6.2 技术决策 #2："向量库用 pgvector 起步"。
 * 本文件是召回层（recall.js）的检索适配器：
 *
 *   DATABASE_URL 已配 → pgvector HNSW ANN（O(logN) 近邻，十万级目录
 *                       个位数毫秒；向量 48 维 L2 归一化 ⇒ <=> 即余弦距离）
 *   未配 / 故障       → annSearch 返回 null，调用方降级 Phase 5 的进程内
 *                       余弦全量扫 —— 检索依赖不挡推荐（与模型质量门、
 *                       Redis 缓存降级同一哲学：AI 链路上任何依赖失能，
 *                       体验降格而非报错）
 *
 * 同步口径：
 *   向量由商品属性确定性派生（FNV-1a，embeddings.js 唯一实现），目录
 *   静态期首次 ANN 查询惰性全量 upsert（进程内 once）；目录变更后由
 *   POST /api/ai/vector-sync 或 npm run db:vector-sync 显式重刷。
 *
 * 依赖图纪律：仅 db(pg)/metrics/catalog/embeddings —— 不经 cache(ioredis)；
 * bandit/model 等 instrumentation 启动链不 import 本文件（Phase 7 的
 * Edge 入口教训：启动链不引入重协议依赖）。
 *
 * GDPR：向量仅由商品属性派生，不含用户数据 —— 无删除义务（007 迁移
 * 表注释同口径）。
 */

import pg from "pg";
import { counter } from "@/lib/metrics";
import { listProducts } from "@/modules/catalog/service";
import { productVector } from "./embeddings";

const DIMENSION = 48; // 与 007 迁移 vector(48) 对齐；embeddings.js DIMS 变更时须同步迁移

const searchTotal = counter("solfit_vector_search_total"); // labels: {mode: pgvector|memory}

let _pool = null; // 惰性连接池：null=未初始化 false=不可用
let _driver = "memory"; // 配置态：DATABASE_URL 有 → pgvector，否则 memory
let _mode = null; // 运行态：pgvector（最近一次 ANN 成功）| memory（降级中）| null（未探测）
let _syncedAt = null; // 最近一次同步成功时间（ISO）
let _lastError = null; // 最近一次 PG 错误（监控可观测；成功后清除）
let _syncPromise = null; // 并发去重

function getPool() {
  if (_pool !== null) return _pool || null;
  if (!process.env.DATABASE_URL) {
    _driver = "memory";
    _pool = false;
    return null;
  }
  _driver = "pgvector";
  try {
    const url = process.env.DATABASE_URL;
    _pool = new pg.Pool({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 2000, // PG 不可达时快速失败 → 降级内存（不让请求挂 30s）
      idleTimeoutMillis: 30000,
      // 与 migrations/run.js 同款 TLS 口径：本地明文，托管 PG 走 TLS
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
    });
    _pool.on("error", () => {}); // 池后台失连不崩进程 —— 下次查询走 catch 降级
  } catch (err) {
    _lastError = err.message;
    _pool = false;
  }
  return _pool || null;
}

/** 全量幂等 upsert（目录静态期 once；运维端点可强制重刷） */
async function syncNow() {
  const pool = getPool();
  if (!pool) return { synced: false, reason: "DATABASE_URL not configured" };

  const products = listProducts();
  const ids = [];
  const vecs = [];
  for (const p of products) {
    const v = productVector(p);
    if (!v || v.length !== DIMENSION) throw new Error(`product #${p.id}: bad vector dim ${v?.length}`);
    ids.push(p.id);
    vecs.push("[" + v.join(",") + "]");
  }
  const res = await pool.query(
    `INSERT INTO product_vectors (product_id, embedding, synced_at)
     SELECT id, vec::vector, now()
     FROM unnest($1::int[], $2::text[]) AS t(id, vec)
     ON CONFLICT (product_id)
     DO UPDATE SET embedding = EXCLUDED.embedding, synced_at = now()`,
    [ids, vecs]
  );
  _syncedAt = new Date().toISOString();
  return { synced: true, rows: res.rowCount, products: products.length };
}

/** 首次 ANN 前确保检索面已灌（进程内 once；并发请求共享同一 promise） */
function ensureSynced() {
  if (_syncedAt) return Promise.resolve(true);
  if (!_syncPromise) {
    _syncPromise = syncNow()
      .then((r) => r.synced === true)
      .catch((err) => {
        _lastError = err.message;
        return false;
      })
      .finally(() => {
        _syncPromise = null;
      });
  }
  return _syncPromise;
}

/**
 * ANN 近邻检索 —— 余弦距离最近 limit 个商品
 * @param {{queryVector:number[], limit?:number, excludeIds?:number[]}} args
 *   excludeIds：候选集之外的全目录商品（已看/已购/已退换/不感兴趣/心愿单/种子）。
 *   必须在 SQL 里排除而非取回后过滤 —— 否则最相似但被排除的商品（如刚看过的
 *   商品与档案向量天然同向）会占满 top-K 坑位，把候选池尾部的相似商品挤出去，
 *   导致与内存全量扫语义不一致（Phase 14 验证踩过的坑：浏览品挤掉 #3/#9）。
 * @returns {Promise<{productId:number, similarity:number}[]|null>}
 *   null = PG 不可用/故障/表空（调用方降级进程内全量扫）
 */
export async function annSearch({ queryVector, limit = 50, excludeIds = [] }) {
  const pool = getPool();
  if (!pool || !queryVector?.length) {
    searchTotal.inc(1, { mode: "memory" });
    return null;
  }
  try {
    if (!(await ensureSynced())) {
      searchTotal.inc(1, { mode: "memory" });
      return null;
    }
    const q = "[" + queryVector.join(",") + "]";
    // 归一化向量：1 - cosine_distance = 余弦相似度（与 embeddings.js cosine() 同值）
    // 数组参数显式转型（PG 对空数组无法推断类型）；排除后搜索空间 == 候选集，
    // top-K 覆盖候选池 ⇒ 与内存扫数值等价
    const { rows } = await pool.query(
      `SELECT product_id,
              1 - (embedding <=> $1::vector) AS similarity
         FROM product_vectors
        WHERE product_id <> ALL($3::int[])
        ORDER BY embedding <=> $1::vector
        LIMIT $2`,
      [q, Math.max(1, limit), excludeIds]
    );
    _mode = "pgvector";
    _lastError = null;
    searchTotal.inc(1, { mode: "pgvector" });
    return rows.map((r) => ({ productId: r.product_id, similarity: r.similarity }));
  } catch (err) {
    // PG 抖动/超时/表缺失 —— 降级而非报错：推荐可用性 > 检索精度分层
    _mode = "memory";
    _lastError = err.message || err.code || String(err); // 优雅停机时 message 可能为空串 —— 看板仍可观测
    searchTotal.inc(1, { mode: "memory" });
    return null;
  }
}

/** 运维显式重刷（目录变更后）；force 绕过 once 标志 */
export async function syncProductVectors({ force = false } = {}) {
  if (force) _syncedAt = null;
  if (!_syncedAt && !_syncPromise) {
    return syncNow().catch((err) => {
      _lastError = err.message;
      return { synced: false, error: err.message };
    });
  }
  return ensureSynced().then((ok) => (ok ? { synced: true, cached: true } : { synced: false, error: _lastError }));
}

/** 监控快照（recStats → /api/monitoring/overview） */
export function vectorStoreState() {
  getPool(); // 惰性初始化，保证 driver 口径最新
  return {
    driver: _driver, // 配置态：DATABASE_URL 决定
    mode: _mode || (_driver === "pgvector" ? "standby" : "memory"), // 运行态：首次 ANN 后落定
    dimension: DIMENSION,
    syncedAt: _syncedAt,
    lastError: _lastError,
  };
}
