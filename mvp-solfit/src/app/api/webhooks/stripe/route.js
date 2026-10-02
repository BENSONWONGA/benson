import { NextResponse } from "next/server";
import { constructStripeEvent, parsePaymentEvent } from "@/modules/payment/service";
import { updateOrderPaymentStatus } from "@/modules/order/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/stripe — Stripe 支付回调
 * 唯一可信的支付状态来源。签名校验失败一律 400。
 */
export async function POST(request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  // webhook 验签必须使用原始 body，不能经过 JSON.parse
  const rawBody = await request.text();

  let event;
  try {
    event = constructStripeEvent(rawBody, signature);
  } catch (err) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
  }

  const parsed = parsePaymentEvent(event);
  if (parsed) {
    try {
      await updateOrderPaymentStatus(parsed.orderId, { status: parsed.status, paymentRef: parsed.paymentRef });
    } catch (err) {
      // 订单不存在等情况记录但仍 200，避免 Stripe 重试风暴
      console.error(`[webhook] order update failed for ${parsed.orderId}:`, err.message);
    }
  }

  // 200 确认接收，Stripe 才会停止重试
  return NextResponse.json({ received: true });
}
