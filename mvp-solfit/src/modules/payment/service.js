/**
 * modules/payment — 支付适配层（方案文档 §7.1）
 *
 * 真实链路（STRIPE_SECRET_KEY 存在时）：
 *   1. place 下单 → createIntent(orderId, amount, currency) → 返回 clientSecret
 *   2. 前端 Stripe.js confirmCardPayment(clientSecret)
 *   3. webhook /api/webhooks/stripe 收到 payment_intent.succeeded → 订单 status = "paid"
 *      * 绝不信任前端回传的支付结果，只认 webhook
 *   4. 后续追加 Klarna（欧洲 BNPL）与 PayPal —— 跨境转化率关键件（Phase 1.5）
 *
 * Demo 链路（未配置密钥时）：
 *   直接返回 succeeded 引用，订单置 paid —— 开箱可跑，不产生真实扣费。
 */

// 延迟加载 stripe SDK：未配密钥时不引入，减小冷启动体积
let _stripe = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!_stripe) {
    // eslint-disable-next-line global-require
    const Stripe = require("stripe");
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  }
  return _stripe;
}

/**
 * 创建支付意图
 * @param {{orderId:string, amount:number, currency:string}} params  amount 为 USD 金额（角位精度）
 * @returns {{provider, status, clientSecret?, reference?, intentId?}}
 */
export async function createPaymentIntent({ orderId, amount, currency }) {
  const stripe = getStripe();
  if (!stripe) {
    return {
      provider: "demo",
      status: "succeeded",
      reference: "pi_demo_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    };
  }

  // Stripe amount 单位为分（最小货币单位），币种转小写
  const amountCents = Math.round(amount * 100);
  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: currency.toLowerCase(),
    metadata: { orderId },
    automatic_payment_methods: { enabled: true }, // 同时支持卡 / Klarna 等
  });
  return {
    provider: "stripe",
    status: "requires_confirmation",
    intentId: intent.id,
    clientSecret: intent.client_secret,
  };
}

/**
 * 校验 webhook 签名并返回事件对象
 * @param {Buffer|string} rawBody  原始请求体（未被 JSON 解析）
 * @param {string} signature        stripe-signature header
 */
export function constructStripeEvent(rawBody, signature) {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("STRIPE_SECRET_KEY not configured — webhook disabled");
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not configured");
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

/**
 * 根据 webhook 事件解析出订单状态变更
 * @returns {{orderId: string, status: "paid"|"failed", paymentRef: string} | null}
 */
export function parsePaymentEvent(event) {
  const intent = event.data?.object;
  if (!intent || !intent.metadata?.orderId) return null;

  switch (event.type) {
    case "payment_intent.succeeded":
      return { orderId: intent.metadata.orderId, status: "paid", paymentRef: intent.id };
    case "payment_intent.payment_failed":
      return { orderId: intent.metadata.orderId, status: "failed", paymentRef: intent.id };
    default:
      return null;
  }
}

/** 兼容旧调用：demo 模式直接扣费（仅用于无密钥时的一键下单） */
export function chargeDemo(order) {
  return {
    provider: "demo",
    status: "succeeded",
    reference: "pi_demo_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    authorizedAt: new Date().toISOString(),
  };
}
