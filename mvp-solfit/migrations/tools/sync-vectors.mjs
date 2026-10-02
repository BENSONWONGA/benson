/**
 * migrations/tools/sync-vectors.mjs — 商品向量 → pgvector 离线同步
 *
 * 用法：DATABASE_URL=postgresql://... npm run db:vector-sync
 *   （DATABASE_URL 也可写在项目根 .env 中，本脚本自动加载）
 *
 * 何时跑：
 *   1. migrations/007 应用后（首次建检索面）
 *   2. src/data/products.js 变更后（向量由属性确定性派生 → 属性变则向量变）
 *   3. 运行时 ANN 检索发现表空也会惰性同步一次（vector-store.js），本工具
 *      是运维侧的显式口径 —— 幂等，重复跑无副作用
 *
 * 为什么独立于迁移执行器：向量编码是 FNV-1a + 48 维哈希（Node 侧实现，
 * embeddings.js 是唯一事实来源），SQL 不可派生 —— 与 generate-seed.mjs
 * 同理："代码是种子的事实来源，生成物只做搬运"。
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));

// 与 migrations/run.js 同款 .env 加载（进程环境变量优先）；工具在
// migrations/tools/ 下 —— .env 在仓库根，比 run.js 多一层
(function loadEnv() {
  const envPath = join(here, "..", "..", ".env");
  let text;
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
})();

// package.json 未设 type:module —— ESM 源文件用 data: URL 导入
// （generate-seed.mjs 同款约定；两文件均无其他 import，安全可控）
async function importEsm(rel) {
  const src = readFileSync(join(here, rel), "utf8");
  return import(
    "data:text/javascript;charset=utf-8," + encodeURIComponent(src)
  );
}

const { PRODUCTS } = await importEsm("../../src/data/products.js");
const { productVector } = await importEsm("../../src/ai/recommender/embeddings.js");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("✗ DATABASE_URL 未配置（.env 或环境变量）");
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();

  const ids = [];
  const vecs = [];
  for (const p of PRODUCTS) {
    const v = productVector(p);
    if (!v || v.length !== 48) {
      console.error(`✗ #${p.id} ${p.name} 向量维度异常（期望 48，得到 ${v?.length}）`);
      process.exit(1);
    }
    ids.push(p.id);
    vecs.push("[" + v.join(",") + "]");
  }

  // 单语句批量 upsert（unnest 展开为行集）—— 大目录也一次往返
  // 数组参数显式转型：PG 对空数组无法推断类型（Phase 2 踩过的坑）
  const res = await client.query(
    `INSERT INTO product_vectors (product_id, embedding, synced_at)
     SELECT id, vec::vector, now()
     FROM unnest($1::int[], $2::text[]) AS t(id, vec)
     ON CONFLICT (product_id)
     DO UPDATE SET embedding = EXCLUDED.embedding, synced_at = now()`,
    [ids, vecs]
  );

  const { rows } = await client.query("SELECT count(*)::int AS n FROM product_vectors");
  console.log(`✓ 已同步 ${res.rowCount} 个商品向量（表内共 ${rows[0].n} 行，幂等）`);
  await client.end();
}

main().catch((e) => {
  console.error("✗ " + e.message);
  process.exit(1);
});
