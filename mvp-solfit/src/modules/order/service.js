/**
 * modules/order — 订单域（模块化单体 · 业务域 3/4）
 * 职责：下单/订单状态机。支付与物流为外部服务（适配器模式，见 external/）
 * TODO(Phase 1 后半): 接 Stripe PaymentIntent + 物流商下单 API + 库存扣减
 */

import { store, trackEvent } from "@/lib/db";
import { getCart, cartTotals } from "@/modules/cart/service";
import { getProduct } from "@/modules/catalog/service";

const STATUS_FLOW = ["created", "paid", "fulfilled", "delivered", "exchanged", "returned"];

export function createOrder(sessionId, { email, address } = {}) {
  const cart = getCart(sessionId);
  if (!cart.items.length) throw new Error("EMPTY_CART");
  const totals = cartTotals(sessionId);

  const order = {
    id: "SO-" + Date.now().toString(36).toUpperCase(),
    email,
    address,
    region: address?.country || "US", // GDPR 分区与税率路由的依据
    items: cart.items.map((i) => ({
      ...i,
      name: getProduct(i.productId)?.name,
      unitPrice: getProduct(i.productId)?.price,
    })),
    totals,
    currency: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || "USD",
    status: "created",
    createdAt: new Date().toISOString(),
  };
  store("orders").set(order.id, order);
  store("carts").set(sessionId, { items: [] });
  trackEvent("order.created", { sessionId, orderId: order.id, total: order.totals.total, region: order.region });
  // TODO: 支付网关 PaymentIntent（Stripe/Adyen）→ 成功回调将 status 置为 paid
  return order;
}

export function getOrder(orderId) {
  return store("orders").get(orderId) || null;
}

/**
 * 退货/换码回流 —— AI 尺码引擎 V3 的燃料入口
 * 每一次换码都携带原因（尺码不合/品质/描述不符），回流进 fit 数据集
 */
export function applyExchange(orderId, { productId, fromSize, toSize, reason }) {
  const order = getOrder(orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  order.status = "exchanged";
  store("orders").set(orderId, order);
  trackEvent("order.exchange", { orderId, productId, fromSize, toSize, reason });
  // TODO(Phase 2): 写入 fit_training_set 表（尺码推荐模型训练数据）
  return order;
}
