/**
 * modules/merchant — 商家操作域（模块化单体 · Phase 16 补充 · 商家后台 MVP）
 *
 * 与 /admin/baseline、/admin/monitoring（只读看板）不同，本域是商家
 * 的**操作**入口：订单发货、库存补货、经营速览。
 *
 * 鉴权（骨架期）：x-admin-token 恒时比较 process.env.ADMIN_TOKEN
 * （默认 dev-admin-token，仅限本地/预览；Phase 2 换正式 RBAC —— 商家
 * 角色挂 users 表，操作走审计日志）。API 路由统一 isAdmin 门禁。
 *
 * 事件管道：order_shipped / inventory_restocked 均已声明进
 * EVENT_SCHEMA（deny-by-default），发货与补货操作全量可观测。
 */

import { timingSafeEqual } from "crypto";
import { store, trackEvent } from "@/lib/db";
import {
  allProducts, createProduct, updateProduct, setListed,
} from "@/modules/catalog/service";
import { restock, getStock } from "@/modules/inventory/service";
import { syncProductVectors } from "@/ai/recommender/vector-store";
import { findActiveStaffByToken } from "@/modules/master/service";

const NEW_PRODUCT_STOCK = 6; // 新建商品每码初始库存

/** 目录变更后的向量重刷（fire-and-forget：PG 抖动不挡商品操作，降级内存召回兜底） */
function refreshVectors() {
  syncProductVectors({ force: true }).catch(() => {});
}

// ===== 鉴权 =====

/** 恒时比较，避免时序侧信道 */
function tokensMatch(a, b) {
  const ba = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function isAdmin(request) {
  const url = new URL(request.url);
  const token = request.headers.get("x-admin-token") || url.searchParams.get("token");
  if (tokensMatch(token, process.env.ADMIN_TOKEN || "dev-admin-token")) return true;
  // Phase 22：总后台签发的员工令牌（每请求实时查 —— 总后台吊销即失效）
  return !!findActiveStaffByToken(token);
}

// ===== 订单 =====

/** 商家侧订单列表（摘要形态；?status= 筛选，最新在前） */
export function listOrders({ status, limit = 100 } = {}) {
  let orders = [...store("orders").values()];
  if (status) orders = orders.filter((o) => o.status === status);
  return orders
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit)
    .map((o) => ({
      id: o.id,
      status: o.status,
      createdAt: o.createdAt,
      email: o.email,
      name: o.address?.name ?? null,
      country: o.address?.country ?? null,
      region: o.region,
      currency: o.currency,
      total: o.totals?.total ?? null,
      itemCount: (o.items || []).reduce((s, i) => s + (i.qty || 0), 0),
      items: (o.items || []).map((i) => ({ name: i.name, size: i.size, qty: i.qty })),
      tracking: o.tracking ?? null,
      hasAccount: !!o.userId,
      shippedAt: o.shippedAt ?? null,
    }));
}

/** 标记发货：订单状态机 paid → shipped（唯一可信入口，财务口径与前台一致） */
export function markShipped(orderId, { tracking } = {}) {
  const order = store("orders").get(orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.status !== "paid") throw new Error("NOT_SHIPPABLE"); // 只有已支付可发货
  order.status = "shipped";
  order.shippedAt = new Date().toISOString();
  if (tracking) order.tracking = tracking; // 不传则保留下单时签发的 stub 单号
  store("orders").set(orderId, order);
  trackEvent("order_shipped", { orderId, region: order.region });
  return order;
}

// ===== 库存 =====

/** 全量库存矩阵：商品 × 尺码（0 码红 / 低于 3 黄，前端染色；含未上架商品 —— 商家视图） */
export function listInventory() {
  return allProducts().map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    listed: p.listed !== false,
    sizes: p.sizes.map((s) => ({ size: s, stock: getStock(p.id, s) })), // getStock 内含 ensureSeed
  }));
}

/**
 * 批量补货：[{productId, size, qty}] —— 复用 inventory 域的锁语义，
 * 与下单扣减互斥（补货窗口不会有超卖窗口）。
 */
export async function restockMany(items) {
  if (!Array.isArray(items) || !items.length) throw new Error("INVALID_RESTOCK");
  for (const it of items) {
    const qty = Number(it.qty);
    if (!it.productId || !it.size || !Number.isInteger(qty) || qty <= 0 || qty > 999) {
      throw new Error("INVALID_RESTOCK");
    }
  }
  for (const it of items) await restock(it.productId, it.size, it.qty);
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  trackEvent("inventory_restocked", { lines: items.length, qty: totalQty });
  return { lines: items.length, qty: totalQty };
}

/** 一键补货低库存：给商品所有 stock<target 的尺码补到 target（默认 6） */
export async function restockLowSizes(productId, target = 6) {
  const product = allProducts().find((p) => p.id === Number(productId));
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  const items = product.sizes
    .map((s) => ({ productId: product.id, size: s, qty: Math.max(0, target - getStock(product.id, s)) }))
    .filter((i) => i.qty > 0);
  if (!items.length) return { lines: 0, qty: 0 };
  for (const it of items) await restock(it.productId, it.size, it.qty);
  trackEvent("inventory_restocked", { lines: items.length, qty: items.reduce((s, i) => s + i.qty, 0) });
  return { lines: items.length, qty: items.reduce((s, i) => s + i.qty, 0) };
}

// ===== 经营速览 =====

/**
 * 商家速览（GMV 口径：已成交 = 非 pending_payment / payment_failed，
 * 含换货退货单 —— 财务事实不因售后回滚，与订单域快照原则一致）。
 */
export function merchantStats() {
  const orders = [...store("orders").values()];
  const isSettled = (o) => o.status !== "pending_payment" && o.status !== "payment_failed";
  const settled = orders.filter(isSettled);
  const products = allProducts();
  let lowStock = 0;
  for (const p of products) for (const s of p.sizes) if (getStock(p.id, s) === 0) lowStock++;

  // 毛利口径（UE 模型核心行）：GMV − Σ(商品成本×数量)；cost 缺失的商品按 40% 兜底
  const costOf = new Map(products.map((p) => [p.id, p.cost ?? Math.round(p.price * 0.4)]));
  const gmv = Math.round(settled.reduce((s, o) => s + (o.totals?.total || 0), 0) * 100) / 100;
  const cogs = Math.round(
    settled.reduce(
      (s, o) => s + (o.items || []).reduce((cs, i) => cs + (costOf.get(Number(i.productId)) || 0) * i.qty, 0),
      0,
    ) * 100,
  ) / 100;

  return {
    orders: orders.length,
    gmvUsd: gmv,
    cogsUsd: cogs,
    marginUsd: Math.round((gmv - cogs) * 100) / 100,
    marginPct: gmv > 0 ? Math.round(((gmv - cogs) / gmv) * 100) : 0,
    toShip: orders.filter((o) => o.status === "paid").length,
    shipped: orders.filter((o) => o.status === "shipped").length,
    afterSales: orders.filter((o) => o.status === "exchanged" || o.status === "returned").length,
    oosSizes: lowStock,
    registeredUsers: store("users").size,
    products: products.length,
    unlisted: products.filter((p) => p.listed === false).length,
  };
}

// ===== 商品运营编排（Phase 17；CRUD 本体在 catalog 域，本层补库存/向量联动）=====

/** 商家商品视图：全目录（含下架）+ 库存汇总，供 Catalog tab 与 overview 轮询 */
export function adminListProducts() {
  return allProducts().map((p) => {
    const stocks = p.sizes.map((s) => getStock(p.id, s));
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      category: p.category,
      heel: p.heel,
      widths: p.widths,
      price: p.price,
      compareAt: p.compareAt,
      image: p.image,
      images: p.images || [], // 详图画廊（Phase 23 上传/外链）
      desc: p.desc,
      features: p.features,
      badge: p.badge,
      sizes: p.sizes,
      lastCode: p.lastCode,
      rating: p.rating,
      reviewsCount: p.reviewsCount,
      listed: p.listed !== false,
      stock: stocks.reduce((s, x) => s + x, 0),
      oosCount: stocks.filter((x) => x === 0).length,
      createdAt: p.createdAt ?? null,
    };
  });
}

/** 新建商品 = catalog.createProduct + 每码初始库存 + 向量重刷（fire-and-forget） */
export async function adminCreateProduct(payload) {
  const product = createProduct(payload);
  for (const size of product.sizes) await restock(product.id, size, NEW_PRODUCT_STOCK);
  refreshVectors(); // 推荐召回面即刻覆盖新商品（pgvector upsert）
  return product;
}

/** 更新商品 = catalog.updateProduct + 向量重刷（价格/文案变化会改派生向量） */
export function adminUpdateProduct(id, patch) {
  const next = updateProduct(id, patch);
  refreshVectors();
  return next;
}

/** 上下架 = catalog.setListed + 向量重刷（召回层以 listed 商品为候选集） */
export function adminSetListed(id, listed) {
  const next = setListed(id, listed);
  refreshVectors();
  return next;
}
