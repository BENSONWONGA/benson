/**
 * ai/retention/rfm.js — RFM 会员分层（Phase 7）
 *
 * 复购是 DTC 利润引擎（方案文档 §8.1：复购老客贡献约 60% 收入）。
 * RFM 把订单流翻译成运营可直接行动的人群，是留存推荐的第一跳：
 *   R(Recency)   距上次成交天数 —— 挽回窗口的时钟
 *   F(Frequency) 成交订单数     —— 复购习惯
 *   M(Monetary)  累计消费       —— LTV 近似（多币种订单已存 fxRate，Phase 8+ 折算）
 *
 * 分层规则刻意保持"可解释、可运营"（10 SKU 骨架期不搞打分黑箱）：
 *   vip      F ≥ 2 且 R ≤ 90    复购且近期活跃 —— 最高价值，新品优先触达
 *   active   R ≤ 90             近期有成交
 *   at_risk  91 ≤ R ≤ 180       挽回黄金窗口（行业共识：成本远低于拉新）
 *   lapsed   R > 180            深度流失 —— 文案与激励力度差异化
 * isNew（首购 ≤ 30 天）单独标记不参与分层 —— onboarding 文案差异化用。
 *
 * GDPR：只读订单派生；erase 把订单 sessionId/email 置 null 后，会话在
 * paidOrdersBySession 自然失联（分层零成本合规）。
 * 只统计 status=paid 订单 —— pending_payment 不是收入。
 */

import { store } from "@/lib/db";

const DAY_MS = 24 * 60 * 60_000;

/** 会话 → 已支付订单（按时间升序）。订单脱关联（sessionId=null）后自动出列。 */
export function paidOrdersBySession() {
  const by = new Map();
  for (const o of store("orders").values()) {
    if (o.status !== "paid" || !o.sessionId) continue;
    const list = by.get(o.sessionId) || [];
    list.push(o);
    by.set(o.sessionId, list);
  }
  for (const list of by.values()) list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return by;
}

/** RFM 度量（orders 非空，由调用方保证） */
export function rfmOf(orders) {
  const totals = orders.map((o) => Number(o.totals?.total) || 0);
  return {
    recencyDays: Math.max(0, Math.floor((Date.now() - new Date(orders[orders.length - 1].createdAt).getTime()) / DAY_MS)),
    frequency: orders.length,
    monetary: Math.round(totals.reduce((a, b) => a + b, 0) * 100) / 100,
    firstOrderAt: orders[0].createdAt,
    lastOrderAt: orders[orders.length - 1].createdAt,
  };
}

/** 分层判定（纯函数，运营规则调整只改这里） */
export function tierOf({ recencyDays, frequency }) {
  if (recencyDays <= 90 && frequency >= 2) return "vip";
  if (recencyDays <= 90) return "active";
  if (recencyDays <= 180) return "at_risk";
  return "lapsed";
}

/** 单客画像：RFM + 分层 + 已购订单（场景引擎的输入） */
export function customerStats(sessionId) {
  const orders = paidOrdersBySession().get(sessionId);
  if (!orders?.length) return null;
  const rfm = rfmOf(orders);
  return { sessionId, rfm, tier: tierOf(rfm), isNew: rfm.frequency === 1 && rfm.recencyDays <= 30, orders };
}

/** 全量分层 + 各层规模（监控看板与 API 预览共用） */
export function segmentCustomers() {
  const by = paidOrdersBySession();
  const customers = [];
  const tiers = { vip: 0, active: 0, at_risk: 0, lapsed: 0 };
  for (const [sessionId, orders] of by) {
    const rfm = rfmOf(orders);
    const tier = tierOf(rfm);
    tiers[tier]++;
    customers.push({ sessionId, rfm, tier, isNew: rfm.frequency === 1 && rfm.recencyDays <= 30, orders });
  }
  // 挽回优先级排序：at_risk > vip > lapsed > active（digest 名额有限时先救最值钱的窗口）
  const TIER_PRIO = { at_risk: 0, vip: 1, lapsed: 2, active: 3 };
  customers.sort((a, b) => (TIER_PRIO[a.tier] - TIER_PRIO[b.tier]) || (a.rfm.recencyDays - b.rfm.recencyDays));
  return { customers, tiers, total: customers.length };
}
