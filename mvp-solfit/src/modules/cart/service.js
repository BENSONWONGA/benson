/**
 * modules/cart — 购物车域（模块化单体 · 业务域 2/4）
 * 职责：会话购物车 + 账户车镜像（Phase 16）。
 * 库存校验在 Phase 1 后半接入（当前骨架仅记录）。
 *
 * Phase 16 双写策略：会话车是本会话事实源（结账/展示读它）；会话已
 * 绑定账户时，每次变更镜像到 userCarts（跨设备水合源）。登录时由
 * auth service 调 mergeCarts 合并游客车 ∪ 账户车（TODO(Phase 2) 兑现）。
 */

import { store, trackEvent } from "@/lib/db";
import { getProduct } from "@/modules/catalog/service";

export function getCart(sessionId) {
  return store("carts").get(sessionId) || { items: [] };
}

/** 会话已绑定账户 → 购物车镜像到 userCarts（跨设备水合源） */
function mirrorToUser(sessionId, cart) {
  const bound = store("userSessions").get(sessionId);
  if (bound) store("userCarts").set(bound.userId, { items: cart.items.map((i) => ({ ...i })) });
}

export async function addToCart(sessionId, { productId, size, width = "Standard", qty = 1 }) {
  const product = await getProduct(productId);
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  if (!product.sizes.includes(String(size))) throw new Error("INVALID_SIZE");
  if (product.oos.includes(String(size))) throw new Error("SIZE_OUT_OF_STOCK");

  const cart = mutate(sessionId, (c) => {
    const existing = c.items.find((i) => i.productId === product.id && i.size === size && i.width === width);
    if (existing) existing.qty += qty;
    else c.items.push({ productId: product.id, size, width, qty });
  });
  trackEvent("cart_added", { sessionId, productId: product.id, size, width, qty });
  return cart;
}

export function updateQty(sessionId, index, qty) {
  return mutate(sessionId, (c) => {
    if (!c.items[index]) throw new Error("ITEM_NOT_FOUND");
    c.items[index].qty = Math.max(1, qty);
  });
}

export function removeItem(sessionId, index) {
  return mutate(sessionId, (c) => {
    if (!c.items[index]) throw new Error("ITEM_NOT_FOUND");
    c.items.splice(index, 1);
  });
}

/** 统一变更入口：改会话车 → 镜像账户车（库存校验前置到 addToCart 调用方时在此扩展） */
function mutate(sessionId, fn) {
  const cart = getCart(sessionId);
  fn(cart);
  store("carts").set(sessionId, cart);
  mirrorToUser(sessionId, cart);
  return cart;
}

/** 同款（productId+size+width）数量加和；不同款并置 —— 游客车 ∪ 账户车 */
export function mergeCarts(a, b) {
  const items = [...(a?.items || []).map((i) => ({ ...i }))];
  for (const it of b?.items || []) {
    const ex = items.find((x) => x.productId === it.productId && x.size === it.size && x.width === it.width);
    if (ex) ex.qty += it.qty;
    else items.push({ ...it });
  }
  return { items };
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
