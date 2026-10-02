/**
 * modules/catalog — 商品域（模块化单体 · 业务域 1/4）
 * 职责：商品/类目/尺码/楦型库。搜索接 ES、缓存接 Redis 都在此域内换，不外溢。
 */

import { PRODUCTS } from "@/data/products";
import { cacheOrSet } from "@/lib/cache";

/** 列表查询（API 形状与原型 api.js stub 一致） */
export function listProducts({ category, width, heel, sort } = {}) {
  let list = PRODUCTS.slice();
  if (category && category !== "All") list = list.filter((p) => p.category === category);
  if (width && width !== "All") list = list.filter((p) => p.widths.includes(width));
  if (heel && heel !== "All") list = list.filter((p) => p.heel === heel);
  if (sort === "price-asc") list.sort((a, b) => a.price - b.price);
  if (sort === "price-desc") list.sort((a, b) => b.price - a.price);
  if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
  return list;
}

/** 详情（带缓存 —— Phase 2 数据迁 PG 后此层自动命中 Redis） */
export async function getProduct(id) {
  return cacheOrSet(`product:${id}`, () => PRODUCTS.find((p) => p.id === Number(id)) || null, 300);
}

/** 结构化检索 —— AI 导购 Function Calling 的数据源（防幻觉的唯一事实来源） */
export function searchProducts({ keyword, category, heel, width, max = 4 } = {}) {
  let list = PRODUCTS.slice();
  if (category) list = list.filter((p) => p.category.toLowerCase() === String(category).toLowerCase());
  if (heel) list = list.filter((p) => p.heel.toLowerCase() === String(heel).toLowerCase());
  if (width) list = list.filter((p) => p.widths.some((w) => w.toLowerCase() === String(width).toLowerCase()));
  if (keyword) {
    const k = String(keyword).toLowerCase();
    list = list.filter((p) =>
      [p.name, p.category, p.heel, p.desc, (p.features || []).join(" ")].join(" ").toLowerCase().includes(k)
    );
  }
  return list.slice(0, max);
}

/** 楦型库 —— 尺码推荐核心资产。TODO(Phase 2): 独立 last 表 + 3D 扫描数据 */
export const LAST_LIBRARY = {
  W1: { name: "Court Standard", runs: "true", widthNote: "Standard" },
  W2: { name: "Rounded Ease", runs: "generous", widthNote: "Slightly generous — size down if between" },
  W3: { name: "Adaptive Knit", runs: "true", widthNote: "Knit adapts to swelling" },
  W4: { name: "True Wide", runs: "true", widthNote: "Built wide from day one" },
  H1: { name: "Occasion Heel", runs: "small", widthNote: "Toe box runs small — half up for wide feet" },
  H2: { name: "Work Heel", runs: "true", widthNote: "Instep strap adds volume tolerance" },
  B1: { name: "Chelsea", runs: "generous-socks", widthNote: "Roomy midfoot with socks" },
  F1: { name: "Flat Footbed", runs: "true", widthNote: "Footbed runs narrow" },
  F2: { name: "Cozy Wool", runs: "relaxed", widthNote: "Wool relaxes with wear" },
};
