/**
 * migrations/tools/generate-seed.mjs — 从 src/data/products.js 生成 006_seed_catalog.sql
 *
 * 重新生成：npm run db:seed:generate（products.js 变更后跑一次，提交生成物）
 *
 * 为什么不手写 seed SQL：
 *   1. 图片 URL 含 encodeURIComponent 的长 prompt，手写必出错
 *   2. products.js 在 Phase 2 仍是目录数据的事实来源（CMS 在 Phase 3 接入），
 *      生成器保证 seed 与代码种子 100% 一致
 *
 * 注：products.js 是 ESM 语法但 package.json 未设 type:module，
 *     用 data: URL 动态导入绕过（文件无其他 import，安全可控）。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const src = readFileSync(join(here, "../../src/data/products.js"), "utf8")
  .replace(/^export\s+const\s+PRODUCTS/m, "const PRODUCTS");
const { PRODUCTS } = await import(
  "data:text/javascript;charset=utf-8," +
    encodeURIComponent(src + "\nexport { PRODUCTS };\n")
);

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const arr = (a) => "ARRAY[" + a.map(q).join(",") + "]";
const num = (v) => (v === null || v === undefined ? "NULL" : String(v));

const rows = PRODUCTS.map(
  (p) =>
    `  (${p.id}, ${q(p.slug)}, ${q(p.name)}, ${q(p.category)}, ${q(p.heel)}, ${arr(p.widths)}, ` +
    `${num(p.price)}, ${num(p.compareAt)}, ${q(p.currency)}, ${num(p.rating)}, ${num(p.reviewsCount)}, ` +
    `${p.badge ? q(p.badge) : "NULL"}, '${JSON.stringify(p.fitStats)}'::jsonb, ` +
    `${arr(p.sizes)}, ${arr(p.oos)}, ${q(p.lastCode)}, ${q(p.desc)}, ` +
    `${arr(p.features)}, ${q(p.image)})`
);

const sql = `-- ============================================================
-- 006_seed_catalog.sql — 商品种子 + 库存种子
-- ⚠ 由 migrations/tools/generate-seed.mjs 生成，勿手改
--   重新生成：npm run db:seed:generate
--   数据来源：src/data/products.js
-- ============================================================

INSERT INTO products (
  id, slug, name, category, heel, widths, price_usd, compare_at_usd, currency,
  rating, reviews_count, badge, fit_stats, sizes, oos, last_code,
  description, features, image_url
) VALUES
${rows.join(",\n")}
ON CONFLICT (id) DO NOTHING;

-- 库存种子：oos 尺码为 0，其余 3–9
-- 与 Phase 1 内存种子同公式（modules/inventory/service.js）：确定性伪随机，稳定可测
--   qty = oos ? 0 : 3 + ((product_id * 7 + round(size) * 13) % 7)
INSERT INTO inventory (product_id, size, qty, updated_at)
SELECT p.id, s,
  (CASE WHEN s = ANY (p.oos) THEN 0
        ELSE 3 + ((p.id * 7 + round(s::numeric) * 13) % 7)
   END)::int,
  now()
FROM products p
CROSS JOIN unnest(p.sizes) AS s
ON CONFLICT (product_id, size) DO NOTHING;
`;

writeFileSync(join(here, "..", "006_seed_catalog.sql"), sql);
console.log("✓ 006_seed_catalog.sql 已生成（" + PRODUCTS.length + " 款商品）");
