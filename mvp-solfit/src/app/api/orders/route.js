import { NextResponse } from "next/server";
import { getOrder, applyExchange, ordersForUser } from "@/modules/order/service";
import { getSessionId } from "@/lib/db";
import { boundUserId } from "@/modules/auth/service";
import { observed } from "@/lib/observe";

/**
 * 下单统一走 POST /api/checkout（金额服务端计算），本路由只负责查询与换货回流。
 * GET /api/orders?id=SO-XXX — 订单查询
 * GET /api/orders?mine=1  — 我的订单（Phase 16：账户归属 ∪ 本会话单，按时间倒序）
 * PUT /api/orders — 换货/退货申请（body: {orderId, productId, fromSize, toSize, reason}）
 *   reason ∈ too_small | too_large | quality | not_as_described | changed_mind
 *   —— 尺码型换货是 AI 尺码引擎 V3 的训练数据（方案文档 §5.1）
 *   鉴权：本会话单 或 账户归属单（Phase 16 跨设备换货）
 */

export async function GET(request) {
  return observed("orders", async () => {
    const sp = request.nextUrl.searchParams;

    if (sp.get("mine") === "1") {
      const sessionId = getSessionId();
      const userId = boundUserId(sessionId);
      return NextResponse.json({ code: 0, data: ordersForUser(sessionId, userId) });
    }

    const id = sp.get("id");
    const order = id && getOrder(id);
    if (!order) return NextResponse.json({ code: 404, message: "not found" }, { status: 404 });
    return NextResponse.json({ code: 0, data: order });
  });
}

export async function PUT(request) {
  return observed("orders", async () => {
    const sessionId = getSessionId();
    const body = await request.json().catch(() => null);
    if (!body?.orderId) return NextResponse.json({ code: 400, message: "orderId is required" }, { status: 400 });

    const order = getOrder(body.orderId);
    if (!order) return NextResponse.json({ code: 404, message: "order not found" }, { status: 404 });
    // 本会话单放行；已登录且订单归属本账户也放行（跨设备发起换货）
    const userId = boundUserId(sessionId);
    if (order.sessionId !== sessionId && !(userId && order.userId === userId)) {
      return NextResponse.json({ code: 403, message: "not your order" }, { status: 403 });
    }

    try {
      const updated = await applyExchange(body.orderId, body);
      return NextResponse.json({ code: 0, data: updated });
    } catch (err) {
      return NextResponse.json({ code: 400, message: err.message }, { status: 400 });
    }
  });
}
