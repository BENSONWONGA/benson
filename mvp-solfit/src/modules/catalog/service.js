/**
 * modules/catalog — 商品域（模块化单体 · 业务域 1/4 · Phase 17 store 化）
 * 职责：商品/类目/尺码/楦型库 + 商品运营（新建/改价/上下架）。
 * 搜索接 ES、缓存接 Redis 都在此域内换，不外溢。
 *
 * 数据分层（Phase 17 起）：
 *   src/data/products 的静态数组 → 种子（ensureSeed 首次灌入 store("products")）
 *   运行时一切读写走 store —— 商家后台 CRUD 直接生效，重启后回到种子态
 *   （与 inventory 同款骨架期约定；Phase 2 迁 PG 由迁移脚本接管数据所有权）。
 *
 * 一致性约定：
 *   * listed 标志 = 上下架。前台/AI 导购检索只见 listed；商品页对
 *     unlisted 404；购物车富化不二次拦截（已加购的库存承诺仍兑现）。
 *   * sizes/oos/fitStats/rating/reviewsCount 不可经 updateProduct 改 ——
 *     sizes 牵动库存矩阵、fitStats 属评价域（Phase 18）、rating 由评价聚合。
 *   * 商品变更后 cacheDel(product:{id}) —— getProduct 的 300s 缓存与
 *     商家操作强一致（catalog 写路径的缓存失效责任在本域内）。
 */

import { PRODUCTS } from "@/data/products";
import { store, trackEvent } from "@/lib/db";
import { cacheOrSet, cacheDel } from "@/lib/cache";

/** 种子灌入（进程内 once —— store 为空才灌，商家数据不覆盖） */
function ensureSeed() {
  const m = store("products");
  if (!m.size) for (const p of PRODUCTS) m.set(p.id, { ...p, listed: true });
}

/** 运行时全目录（含下架 —— 商家视图/库存矩阵/分群种子用） */
export function allProducts() {
  ensureSeed();
  return [...store("products").values()].sort((a, b) => a.id - b.id);
}

/** 列表查询（前台形状不变；默认只见在售，includeUnlisted 供商家视图） */
export function listProducts({ category, width, heel, sort, includeUnlisted } = {}) {
  let list = allProducts();
  if (!includeUnlisted) list = list.filter((p) => p.listed !== false);
  if (category && category !== "All") list = list.filter((p) => p.category === category);
  if (width && width !== "All") list = list.filter((p) => p.widths.includes(width));
  if (heel && heel !== "All") list = list.filter((p) => p.heel === heel);
  if (sort === "price-asc") list.sort((a, b) => a.price - b.price);
  if (sort === "price-desc") list.sort((a, b) => b.price - a.price);
  if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
  return list;
}

/** 详情（带缓存 —— 变更写路径同步失效，见 updateProduct/setListed） */
export async function getProduct(id) {
  ensureSeed();
  return cacheOrSet(`product:${id}`, () => store("products").get(Number(id)) || null, 300);
}

/** 结构化检索 —— AI 导购 Function Calling 的数据源（防幻觉的唯一事实来源；不推已下架） */
export function searchProducts({ keyword, category, heel, width, max = 4 } = {}) {
  let list = allProducts().filter((p) => p.listed !== false);
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

// ===== 商品运营（merchant API 调用；Phase 17）=====

const slugify = (name) =>
  String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "product";

const parseList = (v) =>
  (Array.isArray(v) ? v : String(v || "").split(",")).map((s) => String(s).trim()).filter(Boolean);

/**
 * 新建商品 —— 尺码/楦型/宽窄定死（sizes 牵动库存矩阵，后续只经库存域补货）；
 * rating/reviewsCount 从 0 起步，fitStats 均匀兜底（Phase 18 评价聚合接管）。
 */
export function createProduct(payload = {}) {
  ensureSeed();
  const name = String(payload.name || "").trim();
  const category = String(payload.category || "").trim();
  const price = Number(payload.price);
  const sizes = parseList(payload.sizes);
  const lastCode = String(payload.lastCode || "").trim();

  if (!name || !category) throw new Error("MISSING_FIELDS");
  if (!Number.isFinite(price) || price <= 0) throw new Error("INVALID_PRICE");
  if (!sizes.length) throw new Error("MISSING_SIZES");
  if (!LAST_LIBRARY[lastCode]) throw new Error("INVALID_LAST_CODE");

  const m = store("products");
  const id = Math.max(0, ...m.keys()) + 1;
  const product = {
    id,
    slug: slugify(name),
    name,
    category,
    heel: String(payload.heel || "Flat").trim(),
    widths: parseList(payload.widths).length ? parseList(payload.widths) : ["Standard"],
    price,
    compareAt: Number(payload.compareAt) > 0 ? Number(payload.compareAt) : null,
    currency: "USD",
    rating: 0,
    reviewsCount: 0,
    badge: null,
    fitStats: { small: 33, true: 34, large: 33 },
    sizes,
    oos: [],
    lastCode,
    desc: String(payload.desc || "").trim().slice(0, 600),
    features: parseList(payload.features).slice(0, 8),
    image: String(payload.image || "").trim(),
    images: parseList(payload.images).slice(0, 8), // 详图画廊（Phase 23 本地上传/外链皆可）
    listed: true,
    createdAt: new Date().toISOString(),
  };
  m.set(id, product);
  trackEvent("product_created", { productId: id, name: product.name, price });
  return product;
}

/** 改价/文案/图等运营字段 —— 白名单外的结构性字段一律拒绝（见文件头一致性约定） */
export function updateProduct(id, patch = {}) {
  ensureSeed();
  const p = store("products").get(Number(id));
  if (!p) throw new Error("PRODUCT_NOT_FOUND");

  const next = { ...p };
  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new Error("INVALID_NAME");
    next.name = name;
  }
  if (patch.price !== undefined) {
    const price = Number(patch.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error("INVALID_PRICE");
    next.price = price;
  }
  if (patch.compareAt !== undefined) next.compareAt = Number(patch.compareAt) > 0 ? Number(patch.compareAt) : null;
  if (patch.desc !== undefined) next.desc = String(patch.desc).trim().slice(0, 600);
  if (patch.features !== undefined) next.features = parseList(patch.features).slice(0, 8);
  if (patch.image !== undefined) next.image = String(patch.image).trim();
  if (patch.images !== undefined) next.images = parseList(patch.images).slice(0, 8);
  if (patch.badge !== undefined) next.badge = patch.badge ? String(patch.badge).trim().slice(0, 24) : null;
  if (patch.widths !== undefined) {
    const widths = parseList(patch.widths);
    if (widths.length) next.widths = widths;
  }
  if (patch.heel !== undefined && String(patch.heel).trim()) next.heel = String(patch.heel).trim();
  if (patch.lastCode !== undefined) {
    const lastCode = String(patch.lastCode).trim();
    if (!LAST_LIBRARY[lastCode]) throw new Error("INVALID_LAST_CODE");
    next.lastCode = lastCode;
  }

  store("products").set(p.id, next);
  cacheDel(`product:${p.id}`);
  trackEvent("product_updated", { productId: p.id, price: next.price });
  return next;
}

/** 上下架 —— 前台/AI 导购即刻不可见（listProducts/searchProducts 过滤 listed） */
export function setListed(id, listed) {
  ensureSeed();
  const p = store("products").get(Number(id));
  if (!p) throw new Error("PRODUCT_NOT_FOUND");
  p.listed = !!listed;
  store("products").set(p.id, p);
  cacheDel(`product:${p.id}`);
  trackEvent("product_listed", { productId: p.id, listed: p.listed });
  return p;
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
