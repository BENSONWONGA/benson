/**
 * lib/analytics.js — 转化基线（Phase 1 里程碑：首月转化率与退货率基线）
 * 漏斗：product_viewed → cart_added → checkout_started → order_created
 * KPI：转化率、退货/换码率、AI 尺码推荐覆盖率
 */

import { store } from "@/lib/db";

export function baselineSnapshot() {
  const events = store("events");
  const orders = store("orders");

  const count = (name) => events.filter((e) => e.name === name).length;
  const views = count("product_viewed");
  const cartAdds = count("cart_added");
  const checkouts = count("checkout_started");
  const created = count("order_created");
  const exchanged = count("order_exchanged");
  const aiRecommended = count("ai_size_recommended");

  const rate = (a, b) => (b === 0 ? 0 : Math.round((a / b) * 1000) / 10);
  const orderList = [...orders.values()];

  return {
    funnel: [
      { step: "Product viewed", count: views },
      { step: "Added to cart", count: cartAdds },
      { step: "Started checkout", count: checkouts },
      { step: "Order created", count: created },
    ],
    rates: {
      viewToCart: rate(cartAdds, views),
      cartToOrder: rate(created, cartAdds),
      checkoutToOrder: rate(created, checkouts),
    },
    kpis: {
      returnRate: orderList.length ? Math.round((orderList.filter((o) => o.status === "exchanged" || o.status === "returned").length / orderList.length) * 1000) / 10 : 0,
      aiCoverage: created ? Math.round((aiRecommended / created) * 1000) / 10 : 0,
      ordersTotal: orderList.length,
      gmvUsd: orderList.reduce((s, o) => s + (o.totals?.total || 0), 0),
    },
    note: "骨架期为进程内存数据；Phase 2 起由 Kafka 事件流入数仓计算（方案文档 §7.3）",
  };
}
