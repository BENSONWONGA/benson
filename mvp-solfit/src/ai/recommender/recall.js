/**
 * ai/recommender/recall.js — 多路召回
 *   CF     : 与本会话商品在其他会话中共现过的商品（行为相似人群信号）
 *   Content: 与种子商品的结构相似（类目/跟高/楦型家族/宽窄/价位带）—— baseline 变体
 *   Vector : 结构相似的路向量版 —— vector_lr 变体（Phase 5 内存全量扫；
 *            Phase 14 起优先 pgvector ANN，见 vector-store.js）
 *   Popular: 全站热度兜底
 * 目录小（10 SKU）时对全量打分；Phase 14 兑现"目录变大后向量路原位换
 * ES/pgvector ANN"——recallVector 转 async，ANN 不可用时原位回落内存扫。
 */

import { productVector, queryVector, cosine } from "./embeddings";
import { annSearch } from "./vector-store";
import { listProducts } from "@/modules/catalog/service";

function topN(scores, limit) {
  return new Map([...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit));
}

const VECTOR_SCALE = 3; // 余弦 [-1,1] → 与规则内容分同量纲（阈值 1.5 ⇒ 相似度 0.5+）

/**
 * 向量召回 —— 种子向量（PDP 相关）或档案向量（历史加权，个性化内容路）
 * @param {Map} productsById id → product 惰性取数器（编排层传入，避免重复 listProducts）
 *
 * Phase 14 起为 async：优先 pgvector HNSW ANN（目录大时 O(logN)），
 * PG 未配/故障/表空 → 降级 Phase 5 的进程内余弦全量扫（数值口径
 * 完全一致：归一化向量上 1-cosine_distance ≡ 点积 ≡ cosine()）。
 * 唯一调用方 recommender/index.js 已 await —— recommend() 对外签名不变。
 */
export async function recallVector({ seed, userFeat, candidates, productsById }) {
  const q = queryVector({ seed, userFeat, productsById });
  if (!q) return new Map();

  // ANN 优先 —— 排除集在 SQL 内生效，使 ANN 的搜索空间严格等于候选集：
  // 已看/已购/已退换/不感兴趣/心愿单的商品与档案向量天然同向（它们构成档案），
  // 若取回后过滤，最相似的被排除品会占满 top-K、挤掉候选池尾部的低相似品，
  // 破坏与内存全量扫的数值等价（见 vector-store.js 注释）
  if (candidates.length) {
    const candIds = new Set(candidates.map((p) => p.id));
    const excludeIds = listProducts()
      .filter((p) => !candIds.has(p.id))
      .map((p) => p.id);
    const ann = await annSearch({
      queryVector: q,
      excludeIds,
      limit: Math.min(candidates.length, 128), // K ≥ 候选池规模 ⇒ 无漏召回（等价内存扫）
    });
    if (ann?.length) {
      const scores = new Map();
      for (const { productId, similarity } of ann) {
        if (similarity > 0) scores.set(productId, similarity * VECTOR_SCALE);
      }
      return scores;
    }
  }

  // 内存降级（Phase 5 原路径 —— 目录小或 PG 不可用时）
  const scores = new Map();
  for (const p of candidates) {
    const s = cosine(q, productVector(p)) * VECTOR_SCALE;
    if (s > 0) scores.set(p.id, s);
  }
  return scores;
}

/**
 * item-item 共现召回
 * 其他会话与"我交互过的商品"重合越多 → 人群越像 → 该会话中的其他商品信号越强
 */
export function recallCollaborative(userFeat, interactions, { limit = 12 } = {}) {
  const myIds = [...new Set([...userFeat.viewed, ...userFeat.carted, ...userFeat.ordered])];
  if (!myIds.length) return new Map();

  const scores = new Map();
  for (const [sid, items] of interactions) {
    if (sid === userFeat.sessionId) continue; // 不自证
    const overlap = myIds.filter((id) => items.has(id)).length;
    if (!overlap) continue; // 与我无交集的会话无信号
    for (const [pid, w] of items) {
      if (myIds.includes(pid)) continue;
      // 对方会话中该商品的交互权重 × 与我的重合度
      scores.set(pid, (scores.get(pid) || 0) + w * overlap);
    }
  }
  return topN(scores, limit);
}

/** 结构相似召回 —— PDP"一周其他日子"的跨类目补充 + 访客冷启动主力 */
export function recallContent(seed, candidates) {
  if (!seed) return new Map();
  const family = String(seed.lastCode || "")[0]; // W/H/B/F 楦型家族，脚感相近
  const scores = new Map();
  for (const p of candidates) {
    let s = 0;
    if (p.category === seed.category) s += 2;
    if (p.heel === seed.heel) s += 0.6;
    if (family && String(p.lastCode || "")[0] === family) s += 1.2;
    if (p.widths.some((w) => seed.widths.includes(w))) s += 0.5;
    if (Math.abs(p.price - seed.price) / seed.price <= 0.35) s += 0.8; // 价位带相近
    if (s > 0) scores.set(p.id, s);
  }
  return scores;
}

/**
 * 全站热度（views + 2×carts + 5×orders）—— Phase 12 起为"当季热度"：
 * 同一热度分在当季类目放大、过季类目衰减（凉鞋的冬季热度多为误流量）。
 * 先验温和（|boost| ≤ 0.8 → 放大系数 ∈ [0.2, 1.8]），回流数据可覆盖。
 */
export function recallPopular(signals, candidates, { limit = 12, seasonal = {} } = {}) {
  const scores = new Map();
  for (const p of candidates) {
    const s = signals.get(p.id);
    const base = s ? s.views + s.carts * 2 + s.orders * 5 : 0;
    scores.set(p.id, Math.max(0, base * (1 + (seasonal[p.category] || 0))));
  }
  return topN(scores, limit);
}
