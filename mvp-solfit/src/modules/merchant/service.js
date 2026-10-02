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
import { PRODUCTS } from "@/data/products";
import { restock, getStock } from "@/modules/inventory/service";

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
  return tokensMatch(token, process.env.ADMIN_TOKEN || "dev-admin-token");
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

/** 全量库存矩阵：商品 × 尺码（0 码红 / 低于 3 黄，前端染色） */
export function listInventory() {
  return PRODUCTS.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
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
  const product = PRODUCTS.find((p) => p.id === Number(productId));
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
  let lowStock = 0;
  for (const p of PRODUCTS) for (const s of p.sizes) if (getStock(p.id, s) === 0) lowStock++;

  return {
    orders: orders.length,
    gmvUsd: Math.round(settled.reduce((s, o) => s + (o.totals?.total || 0), 0) * 100) / 100,
    toShip: orders.filter((o) => o.status === "paid").length,
    shipped: orders.filter((o) => o.status === "shipped").length,
    afterSales: orders.filter((o) => o.status === "exchanged" || o.status === "returned").length,
    oosSizes: lowStock,
    registeredUsers: store("users").size,
  };
}
