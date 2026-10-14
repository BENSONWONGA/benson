import { NextResponse } from "next/server";
import { store } from "@/lib/db";

/**
 * POST /api/debug/seed-order — 测试种子：写入一笔回溯日期的已支付订单
 *
 * 用途：RFM 分层（at_risk/lapsed）与补货到期场景（repurchase_due）依赖
 * "N 天前的订单"，正常下单 API 拿不到 —— 本路由给 e2e 冒烟与运营演练用。
 *
 * 安全：默认 403，仅 ENABLE_DEBUG_SEED=1 时开放（生产环境不设该变量）。
 * body: {sessionId, productId, qty?, daysAgo?, total?, email?}
 */
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (process.env.ENABLE_DEBUG_SEED !== "1") {
    return NextResponse.json({ code: 403, message: "debug seed disabled" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const { sessionId, productId } = body;
  if (!sessionId || !productId) {
    return NextResponse.json({ code: 400, message: "sessionId and productId required" }, { status: 400 });
  }
  const daysAgo = Number(body.daysAgo) || 0;
  const order = {
    id: "debug_" + Date.now().toString(36),
    sessionId,
    email: body.email || null,
    items: [{ productId: Number(productId), size: "40", width: "Standard", qty: Number(body.qty) || 1, lineTotal: Number(body.total) || 100 }],
    totals: { subtotal: Number(body.total) || 100, shipping: 0, tax: 0, total: Number(body.total) || 100 },
    status: "paid",
    createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60_000).toISOString(),
  };
  store("orders").set(order.id, order);
  return NextResponse.json({ code: 0, data: { orderId: order.id, createdAt: order.createdAt } });
}
