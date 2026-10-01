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
import { getProduct } from "@/modules/catalog/service";
import { decrementStock } from "@/modules/inventory/service";
import { issueTrackingNumber, zoneFor } from "@/modules/shipping/service";
import { chargeDemo } from "@/modules/payment/service";

/**
 * 下单（由 /api/checkout place 调用，前端不直接传金额）
 * @param {string} sessionId
 * @param {{email, address, shippingMethod, taxQuote, currency, fxRate, paymentMethod}} payload
 */
export function createOrder(sessionId, payload) {
  const cart = getCart(sessionId);
  if (!cart.items.length) throw new Error("EMPTY_CART");

  const { email, address, shippingMethod, taxQuote, currency = "USD", fxRate = 1 } = payload;
  if (!email || !address?.country || !shippingMethod?.id) throw new Error("MISSING_FIELDS");
  if (!address?.name || !address?.street || !address?.city || !address?.zip) throw new Error("MISSING_FIELDS");

  // 1) 库存校验+扣减（失败抛 OUT_OF_STOCK，购物车不被动过）
  decrementStock(cart.items);

  try {
    // 2) 金额计算（服务端唯一事实，前端只展示）
    const items = cart.items.map((i) => {
      const p = getProduct(i.productId);
      return { ...i, name: p?.name, unitPrice: p?.price, lineTotal: Math.round((p?.price || 0) * i.qty * 100) / 100 };
    });
    const subtotal = Math.round(items.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
    const shipping = Math.round((shippingMethod.finalPrice ?? shippingMethod.price) * 100) / 100;
    const tax = Math.round((taxQuote?.amount || 0) * 100) / 100;

    const order = {
      id: "SO-" + Date.now().toString(36).toUpperCase(),
      sessionId,
      email,
      address,
      region: zoneFor(address.country),
      // 跨境三快照：币种 / 汇率 / 税率规则（对账依据）
      currency,
      fxRate,
      taxRule: { type: taxQuote?.type, label: taxQuote?.label, rate: taxQuote?.rate, provider: taxQuote?.provider },
      items,
      totals: {
        subtotal,
        shipping,
        tax,
        total: Math.round((subtotal + shipping + tax) * 100) / 100,
      },
      shippingMethod: { id: shippingMethod.id, name: shippingMethod.name, zone: shippingMethod.zone },
      tracking: issueTrackingNumber(),
      payment: chargeDemo({ totals: { total: subtotal + shipping + tax }, currency }),
      status: "paid", // 演示桩直接置 paid；真实链路由 Stripe webhook 驱动（见 modules/payment）
      createdAt: new Date().toISOString(),
    };
    store("orders").set(order.id, order);
    store("carts").set(sessionId, { items: [] }); // 清购物车
    trackEvent("order_created", {
      orderId: order.id, sessionId, region: order.region,
      total: order.totals.total, currency,
      itemCount: items.length, taxType: order.taxRule.type,
    });
    return order;
  } catch (err) {
    // 计算失败回滚库存
    for (const i of cart.items) {
      store("inventory").set(`${i.productId}:${i.size}`, (store("inventory").get(`${i.productId}:${i.size}`) || 0) + i.qty);
    }
    throw err;
  }
}

export function getOrder(orderId) {
  return store("orders").get(orderId) || null;
}

/**
 * 换货/退货回流 —— AI 尺码引擎 V3 的燃料入口（方案文档 §5.1）
 * 每次换码必须带 reason（too_small / too_large / quality / not_as_described），
 * 这条数据流将回流到 fit_training_set 训练个性化尺码模型。
 */
export function applyExchange(orderId, { productId, fromSize, toSize = null, reason }) {
  const VALID_REASONS = ["too_small", "too_large", "quality", "not_as_described", "changed_mind"];
  const order = getOrder(orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (!VALID_REASONS.includes(reason)) throw new Error("INVALID_EXCHANGE_REASON");
  if (toSize === fromSize) throw new Error("SAME_SIZE");

  order.status = toSize ? "exchanged" : "returned"; // toSize=null 视为退货
  store("orders").set(orderId, order);

  trackEvent("order_exchanged", {
    orderId, productId, fromSize, toSize, reason,
    // TODO(Phase 2): 写入 fit_training_set 表 —— 与脚型档案关联形成训练样本
  });
  return order;
}
