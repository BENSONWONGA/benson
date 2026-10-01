import { NextResponse } from "next/server";
import { createOrder, getOrder, applyExchange } from "@/modules/order/service";
import { getSessionId } from "@/lib/db";

/** POST /api/orders — 下单（TODO: 接 Stripe PaymentIntent 后才算完整） */
export async function POST(request) {
  const sessionId = getSessionId(request.cookies);
  const body = await request.json().catch(() => ({}));
  try {
    const order = createOrder(sessionId, body);
    return NextResponse.json({ code: 0, data: order });
  } catch (err) {
    return NextResponse.json({ code: 400, message: err.message }, { status: 400 });
  }
}

/** GET /api/orders/:id — query param 传 id（骨架简化，Phase 2 换 RESTful 子路由） */
export async function GET(request) {
  const id = request.nextUrl.searchParams.get("id");
  const order = id && getOrder(id);
  if (!order) return NextResponse.json({ code: 404, message: "not found" }, { status: 404 });
  return NextResponse.json({ code: 0, data: order });
}

/** PUT /api/orders — 换码/退货回流（AI 尺码引擎 V3 的燃料） */
export async function PUT(request) {
  const body = await request.json().catch(() => null);
  try {
    const order = applyExchange(body.orderId, body);
    return NextResponse.json({ code: 0, data: order });
  } catch (err) {
    return NextResponse.json({ code: 400, message: err.message }, { status: 400 });
  }
}
