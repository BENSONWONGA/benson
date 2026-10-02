/**
 * ai/recommender/features.js — 特征提取（召回与排序的底料）
 *
 * 数据源（Phase 3 内存版；Phase 4 由 PG 聚合/流处理替换，本文件签名不变）：
 *   - events         : product_viewed / cart_added（payload 含 sessionId + productId）
 *   - orders         : 下单（最强购买信号，items[] 逐行计入）
 *   - fitProfiles    : 宽窄偏好（widthFeel）—— 合脚匹配特征（本站差异化核心）
 *   - fitTrainingSet : 换货/退货样本 —— 已退换商品排除特征
 *
 * GDPR：全部按 sessionId 关联；erase 后标识置 null，样本自然失联不再命中。
 */

import { store } from "@/lib/db";
import { listProducts } from "@/modules/catalog/service";
import { getFitProfile } from "@/modules/customer/service";

/** 事件动作权重：越靠近成交权重越高 */
const ACTION_WEIGHT = { product_viewed: 1, cart_added: 3 };
const ORDER_WEIGHT = 5; // 订单 = 5× 浏览权重

/** 全站"会话 → 商品累计权重"表 —— item-item 协同过滤的共现底料 */
export function sessionInteractions() {
  const sessions = new Map();
  const bump = (sid, pid, w) => {
    const m = sessions.get(sid) || new Map();
    m.set(pid, (m.get(pid) || 0) + w);
    sessions.set(sid, m);
  };
  for (const e of store("events")) {
    const { sessionId, productId } = e.payload || {};
    if (!sessionId || !productId || !(e.type in ACTION_WEIGHT)) continue;
    bump(sessionId, productId, ACTION_WEIGHT[e.type]);
  }
  for (const o of store("orders").values()) {
    if (!o.sessionId) continue;
    for (const i of o.items) bump(o.sessionId, i.productId, ORDER_WEIGHT);
  }
  return sessions;
}

/** 目标用户特征（无会话/无行为 → 空集，调用方自动降级冷启动） */
export function userFeatures(sessionId) {
  const viewed = new Set();
  const carted = new Set();
  const ordered = new Set();
  const returned = new Set();
  const categoryHits = {};

  if (sessionId) {
    for (const e of store("events")) {
      const p = e.payload || {};
      if (p.sessionId !== sessionId || !p.productId) continue;
      if (e.type === "product_viewed") {
        viewed.add(p.productId);
        if (p.category) categoryHits[p.category] = (categoryHits[p.category] || 0) + 1;
      } else if (e.type === "cart_added") {
        carted.add(p.productId);
      }
    }
    for (const o of store("orders").values()) {
      if (o.sessionId !== sessionId) continue;
      for (const i of o.items) ordered.add(i.productId);
    }
    for (const s of store("fitTrainingSet")) {
      if (s.sessionId === sessionId) returned.add(s.productId); // 退换过的商品不再进入推荐
    }
  }

  const totalCat = Object.values(categoryHits).reduce((a, b) => a + b, 0);
  const categoryAffinity = totalCat
    ? Object.fromEntries(Object.entries(categoryHits).map(([c, n]) => [c, n / totalCat]))
    : {};

  // 常看商品的中位价位（排序的价位亲和特征）
  const prices = [...viewed]
    .map((id) => listProducts().find((p) => p.id === id)?.price)
    .filter((v) => typeof v === "number")
    .sort((a, b) => a - b);

  return {
    sessionId: sessionId || null,
    viewed,
    carted,
    ordered,
    returned,
    categoryAffinity,
    medianPrice: prices.length ? prices[Math.floor(prices.length / 2)] : null,
    profile: sessionId ? getFitProfile(sessionId) : null,
  };
}

/** 商品侧信号：浏览/加购/成交计数与转化率（CTR 式特征，埋点沉淀） */
export function productSignals() {
  const sig = new Map();
  const bump = (pid, k) => {
    const s = sig.get(pid) || { views: 0, carts: 0, orders: 0 };
    s[k]++;
    sig.set(pid, s);
  };
  for (const e of store("events")) {
    const { productId } = e.payload || {};
    if (!productId) continue;
    if (e.type === "product_viewed") bump(productId, "views");
    else if (e.type === "cart_added") bump(productId, "carts");
  }
  for (const o of store("orders").values()) for (const i of o.items) bump(i.productId, "orders");
  for (const s of sig.values()) s.conversion = s.views ? s.orders / s.views : 0;
  return sig;
}
