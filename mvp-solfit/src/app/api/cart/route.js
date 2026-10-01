import { NextResponse } from "next/server";
import { getSessionId, trackEvent } from "@/lib/db";
import { getCart, addToCart, updateQty, removeItem, cartTotals } from "@/modules/cart/service";
import { getProduct } from "@/modules/catalog/service";

/** 商品信息富化 —— 购物车返回结构 {items:[{...item, product:{id,name,price,image}}], totals} */
function hydrate(cart) {
  return {
    ...cart,
    items: cart.items.map((i) => {
      const p = getProduct(i.productId);
      return { ...i, product: p ? { id: p.id, name: p.name, price: p.price, image: p.image, category: p.category } : null };
    }).filter((i) => i.product),
  };
}

/** GET /api/cart — 当前会话购物车（含跨境费用估算） */
export async function GET(request) {
  const sessionId = getSessionId(request.cookies);
  const cart = hydrate(getCart(sessionId));
  return NextResponse.json({ code: 0, data: { ...cart, totals: cartTotals(sessionId) } });
}

/**
 * POST /api/cart — 统一变更入口
 * body: {action: "add"|"update"|"remove", ...payload}
 */
export async function POST(request) {
  const sessionId = getSessionId(request.cookies);
  const body = await request.json().catch(() => ({}));
  try {
    let cart;
    if (body.action === "add") cart = addToCart(sessionId, body);
    else if (body.action === "update") cart = updateQty(sessionId, body.index, body.qty);
    else if (body.action === "remove") cart = removeItem(sessionId, body.index);
    else cart = getCart(sessionId);

    if (body.action) trackEvent(body.action === "add" ? "cart_added" : "cart_updated", { sessionId, action: body.action });
    return NextResponse.json({ code: 0, data: { ...hydrate(cart), totals: cartTotals(sessionId) } });
  } catch (err) {
    return NextResponse.json({ code: 400, message: err.message }, { status: 400 });
  }
}
