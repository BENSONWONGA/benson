/**
 * modules/order — 订单域（模块化单体 · 业务域 3/4）
 * 职责：下单 / 订单状态机 / 换货与退货回流（尺码引擎 V3 的燃料入口）。
 * 跨境关键设计：
 *   - 下单时快照 {currency, fxRate} —— 汇率漂移不影响历史订单
 *   - region 来自收货国 —— GDPR 分区与税务路由的依据
 *   - 税/运费明细全量落单 —— 客诉与财务对账的唯一事实
 */

import { store, trackEvent } from "@/lib/db";
import { getCart } from "@/modules/cart/service";
import { getFitProfile } from "@/modules/customer/service";
import { getProduct } from "@/modules/catalog/service";
import { decrementStock, restock } from "@/modules/inventory/service";
import { issueTrackingNumber, zoneFor } from "@/modules/shipping/service";
import { createPaymentIntent } from "@/modules/payment/service";
import { computeCheckoutDiscounts, settleOrderLoyalty } from "@/modules/loyalty/service";

/**
 * 下单（由 /api/checkout place 调用，前端不直接传金额）
 * @param {string} sessionId
 * @param {{email, address, shippingMethod, taxQuote, currency, fxRate, paymentMethod}} payload
 */
export async function createOrder(sessionId, payload) {
  const cart = getCart(sessionId);
  if (!cart.items.length) throw new Error("EMPTY_CART");

  const { email, address, shippingMethod, taxQuote, currency = "USD", fxRate = 1, promoCode, pointsToRedeem } = payload;
  if (!email || !address?.country || !shippingMethod?.id) throw new Error("MISSING_FIELDS");
  if (!address?.name || !address?.street || !address?.city || !address?.zip) throw new Error("MISSING_FIELDS");

  // 1) 库存校验+扣减（失败抛 OUT_OF_STOCK，购物车不被动过）
  await decrementStock(cart.items);

  try {
    // 2) 金额计算（服务端唯一事实，前端只展示）
    const items = await Promise.all(cart.items.map(async (i) => {
      const p = await getProduct(i.productId);
      return { ...i, name: p?.name, unitPrice: p?.price, lineTotal: Math.round((p?.price || 0) * i.qty * 100) / 100 };
    }));
    const subtotal = Math.round(items.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
    // Phase 19 折扣（服务端统一验签计价；无效码/超额积分直接抛错 —— 宁可不折不可算错）
    const discounts = computeCheckoutDiscounts({ sessionId, subtotal, promoCode, pointsToRedeem });
    const shipping = Math.round((shippingMethod.finalPrice ?? shippingMethod.price) * 100) / 100;
    const tax = Math.round((taxQuote?.amount || 0) * 100) / 100; // 税基为折前小计（骨架期口径，注释见 totals）
    const total = Math.round((subtotal - discounts.promoDiscount - discounts.pointsDiscount + shipping + tax) * 100) / 100;

    const orderId = "SO-" + Date.now().toString(36).toUpperCase();

    // 3) 创建支付意图（Stripe 真实链路 / demo 直扣）
    const payment = await createPaymentIntent({ orderId, amount: total, currency });

    // Phase 16 账户归属：会话已绑定账户 → 订单落 userId（"我的订单"跨设备可见）
    const bound = store("userSessions").get(sessionId);

    const order = {
      id: orderId,
      sessionId,
      userId: bound?.userId ?? null,
      email,
      address,
      region: zoneFor(address.country),
      // 跨境三快照：币种 / 汇率 / 税率规则（对账依据）
      currency,
      fxRate,
      taxRule: { type: taxQuote?.type, label: taxQuote?.label, rate: taxQuote?.rate, provider: taxQuote?.provider },
      items,
      // 折扣明细全量落单（客诉/财务对账唯一事实；税基为折前小计 —— 跨境促销合规简化口径）
      totals: {
        subtotal, shipping, tax, total,
        promoDiscount: discounts.promoDiscount,
        pointsDiscount: discounts.pointsDiscount,
        pointsRedeemed: discounts.pointsRedeemed,
      },
      promoCode: discounts.promo?.code ?? null,
      loyalty: null, // 落单后由 settleOrderLoyalty 回填（earned/tier 快照）
      shippingMethod: { id: shippingMethod.id, name: shippingMethod.name, zone: shippingMethod.zone },
      tracking: issueTrackingNumber(),
      payment,
      // demo 模式直接 paid；Stripe 模式 pending_payment，等 webhook 确认
      status: payment.status === "succeeded" ? "paid" : "pending_payment",
      createdAt: new Date().toISOString(),
    };
    store("orders").set(order.id, order);
    store("carts").set(sessionId, { items: [] }); // 清购物车
    if (bound) store("userCarts").delete(bound.userId); // 账户车镜像同清（跨设备不残留已购清单）
    // 会员结算（Phase 19）：累计实付/积分赚取/积分扣减/优惠码计数 —— 订单快照回填后落库
    order.loyalty = settleOrderLoyalty({
      sessionId, orderTotal: total,
      promoCode: order.promoCode, pointsRedeemed: discounts.pointsRedeemed,
    });
    store("orders").set(order.id, order);
    trackEvent("order_created", {
      orderId: order.id, sessionId, region: order.region,
      total: order.totals.total, currency,
      itemCount: items.length, taxType: order.taxRule.type,
      provider: payment.provider,
    });
    return order;
  } catch (err) {
    // 计算/支付失败回滚库存
    for (const i of cart.items) await restock(i.productId, i.size, i.qty);
    throw err;
  }
}

export function getOrder(orderId) {
  return store("orders").get(orderId) || null;
}

/**
 * 我的订单（Phase 16）：账户归属单 ∪ 本会话单（游客也能看本会话刚下的单），
 * 按时间倒序，仅返回列表摘要（明细走 GET ?id=SO-XXX）。
 */
export function ordersForUser(sessionId, userId) {
  const seen = new Set();
  const list = [];
  for (const o of store("orders").values()) {
    const owned = (userId && o.userId === userId) || (sessionId && o.sessionId === sessionId);
    if (!owned || seen.has(o.id)) continue;
    seen.add(o.id);
    list.push({
      id: o.id,
      status: o.status,
      createdAt: o.createdAt,
      currency: o.currency,
      total: o.totals?.total ?? null,
      itemCount: (o.items || []).reduce((s, i) => s + (i.qty || 0), 0),
      items: (o.items || []).map((i) => ({ productId: i.productId, name: i.name, size: i.size, qty: i.qty })),
      region: o.region,
    });
  }
  return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * 由支付 webhook 调用 —— 唯一可信的支付状态写入入口（不信任前端）
 * paid → 订单可发货；failed → 释放库存、标记失败，用户可重试支付
 */
export async function updateOrderPaymentStatus(orderId, { status, paymentRef }) {
  const order = getOrder(orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.status === status) return order; // 幂等

  if (status === "paid") {
    order.status = "paid";
    order.payment = { ...order.payment, status: "succeeded", reference: paymentRef, paidAt: new Date().toISOString() };
    trackEvent("order_paid", { orderId, total: order.totals.total, currency: order.currency, provider: order.payment.provider });
  } else if (status === "failed") {
    order.status = "payment_failed";
    order.payment = { ...order.payment, status: "failed", reference: paymentRef, failedAt: new Date().toISOString() };
    // 释放库存，避免超卖锁定
    await Promise.all(order.items.map((i) => restock(i.productId, i.size, i.qty)));
    trackEvent("order_payment_failed", { orderId, provider: order.payment.provider });
  }
  store("orders").set(orderId, order);
  return order;
}

/**
 * 换货/退货回流 —— AI 尺码引擎 V3 的燃料入口（方案文档 §5.1）
 * 每次换码必须带 reason（too_small / too_large / quality / not_as_described），
 * 这条数据流将回流到 fit_training_set 训练个性化尺码模型。
 */
export async function applyExchange(orderId, { productId, fromSize, toSize = null, reason }) {
  const VALID_REASONS = ["too_small", "too_large", "quality", "not_as_described", "changed_mind"];
  const order = getOrder(orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (!VALID_REASONS.includes(reason)) throw new Error("INVALID_EXCHANGE_REASON");
  if (toSize === fromSize) throw new Error("SAME_SIZE");

  order.status = toSize ? "exchanged" : "returned"; // toSize=null 视为退货
  store("orders").set(orderId, order);

  // ===== 退货/换码数据回流（AI 闭环燃料 · PG: fit_training_set）=====
  // 写入时冗余训练特征（楦型/习惯尺码/宽窄/区域）—— 档案被 GDPR 删除后
  // 样本仍可训练（特征非识别性），sessionId 供推荐层做"已退换排除"。
  const product = await getProduct(productId);
  const profile = order.sessionId ? getFitProfile(order.sessionId) : null;
  const samples = store("fitTrainingSet");
  samples.push({
    orderId,
    sessionId: order.sessionId,
    productId,
    lastCode: product?.lastCode ?? null,
    fromSize,
    toSize, // null = 纯退货
    reason,
    usualSize: profile?.usualSize ?? null,
    widthFeel: profile?.widthFeel ?? null,
    region: order.region ?? null,
    createdAt: new Date().toISOString(),
  });
  if (samples.length > 1000) samples.shift(); // 骨架期防溢出（Phase 4 落数仓）

  trackEvent("order_exchanged", { orderId, sessionId: order.sessionId, productId, fromSize, toSize, reason });
  return order;
}
