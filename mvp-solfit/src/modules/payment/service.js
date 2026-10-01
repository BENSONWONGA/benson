/**
 * modules/payment — 支付适配层（方案文档 §7.1）
 * Phase 1 演示桩：直接返回成功，订单置 paid。
 * TODO(Phase 1 后半 · 接入顺序)：
 *   1. quote 时创建 Stripe PaymentIntent（amount=total, currency=订单币种）返回 clientSecret
 *   2. 前端 Stripe.js confirmCardPayment
 *   3. webhook: payment_intent.succeeded → orders.status = "paid"（不信任前端回传）
 *   4. 追加 Klarna（欧洲 BNPL）与 PayPal
 * Klarna/BNPL 对跨境转化率是关键件（方案 §7.1），Phase 1.5 接入。
 */

export function chargeDemo(order) {
  if (process.env.STRIPE_SECRET_KEY) {
    // 已配密钥时也走桩 —— 真实扣费必须等 webhook 链路就绪再开
    console.warn("[payment] STRIPE_SECRET_KEY set but demo mode active — wire PaymentIntent + webhook first");
  }
  return {
    provider: "demo",
    status: "succeeded",
    reference: "pi_demo_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    authorizedAt: new Date().toISOString(),
  };
}
