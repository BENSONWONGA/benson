/**
 * modules/cart — 购物车域（模块化单体 · 业务域 2/4）
 * 职责：会话购物车。库存校验在 Phase 1 后半接入（当前骨架仅记录）。
 * TODO(Phase 2): 换 PostgreSQL + Redis，支持游客→账户购物车合并
 */

import { store, trackEvent } from "@/lib/db";
import { getProduct } from "@/modules/catalog/service";

export function getCart(sessionId) {
  return store("carts").get(sessionId) || { items: [] };
}

export async function addToCart(sessionId, { productId, size, width = "Standard", qty = 1 }) {
  const product = await getProduct(productId);
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  if (!product.sizes.includes(String(size))) throw new Error("INVALID_SIZE");
  if (product.oos.includes(String(size))) throw new Error("SIZE_OUT_OF_STOCK");

  const cart = getCart(sessionId);
  const existing = cart.items.find((i) => i.productId === product.id && i.size === size && i.width === width);
  if (existing) existing.qty += qty;
  else cart.items.push({ productId: product.id, size, width, qty });
  store("carts").set(sessionId, cart);
  trackEvent("cart_added", { sessionId, productId: product.id, size, width, qty });
  return cart;
}

export function updateQty(sessionId, index, qty) {
  const cart = getCart(sessionId);
  if (!cart.items[index]) throw new Error("ITEM_NOT_FOUND");
  cart.items[index].qty = Math.max(1, qty);
  store("carts").set(sessionId, cart);
  return cart;
}

export function removeItem(sessionId, index) {
  const cart = getCart(sessionId);
  cart.items.splice(index, 1);
  store("carts").set(sessionId, cart);
  return cart;
}

/** 含履约费用的合计 —— 跨境 UE 模型的核心计算（免邮门槛/关税钩子） */
export async function cartTotals(sessionId) {
  const cart = getCart(sessionId);
  const FREE_SHIPPING = Number(process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD || 120);
  const subtotal = await cart.items.reduce(async (sumP, i) => {
    const sum = await sumP;
    const p = await getProduct(i.productId);
    return sum + (p ? p.price * i.qty : 0);
  }, Promise.resolve(0));
  return {
    subtotal,
    shipping: subtotal === 0 || subtotal >= FREE_SHIPPING ? 0 : 12.9,
    // TODO(Phase 1 后半): 关税/DDP 计算接 Avalara/税务 SaaS，按目的国税率
    duties: 0,
    total: subtotal + (subtotal === 0 || subtotal >= FREE_SHIPPING ? 0 : 12.9),
  };
}
