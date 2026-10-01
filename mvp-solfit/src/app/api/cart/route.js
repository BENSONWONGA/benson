import { NextResponse } from "next/server";
import { getSessionId, trackEvent } from "@/lib/db";
import { getCart, addToCart, updateQty, removeItem, cartTotals } from "@/modules/cart/service";

/** GET /api/cart — 当前会话购物车（含跨境费用计算） */
export async function GET(request) {
  const sessionId = getSessionId(request.cookies);
  const cart = getCart(sessionId);
  return NextResponse.json({ code: 0, data: { ...cart, totals: cartTotals(sessionId) } });
}

/**
 * POST /api/cart — 统一变更入口
 * body: {action: "add"|"update"|"remove", ...payload}
 * TODO(Phase 2): 拆 RESTful 路由 + 游客/账户购物车合并
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
    trackEvent("cart.updated", { sessionId, action: body.action });
    return NextResponse.json({ code: 0, data: { ...cart, totals: cartTotals(sessionId) } });
  } catch (err) {
    return NextResponse.json({ code: 400, message: err.message }, { status: 400 });
  }
}
