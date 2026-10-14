/**
 * ai/recommender/attribution.js — 推荐归因与增量测量（Phase 11）
 *
 * 推荐系统好不好，最终要用钱回答。本模块回答两个不同的问题：
 *
 *   1) 归因（attributeRevenue）：哪些成交"经过"推荐？
 *      印象（recTrainingSet）→ 订单的 last-touch join：成交商品在同会话
 *      有更早的推荐印象 → 该笔计入推荐影响。口径刻意保守（印象必须在
 *      成交之前），但归因天然【高估】真实增量 —— 用户可能本来就要买，
 *      推荐只是"恰好在场"。归因回答"推荐渗透率"，不回答"因果"。
 *
 *   2) 增量（incrementality）：对照臂（control）与个性化臂的转化率差。
 *      control 臂 = 固定小流量 + 无个性化服务（见 bandit.js/index.js），
 *      它不参与 bandit 优化（测量基线不是竞争者）。差值才是推荐系统的
 *      真实增量价值 —— 这是 A/B 科学里唯一能进董事会 PPT 的数字。
 *
 * GDPR：印象按 sessionId 关联，erase 脱关联后归因自然失配（与 Phase 3/5/7
 * 同构的"派生数据跟随源数据"合规模型）。订单脱关联（sessionId=null）
 * 不再参与任何归因，但保留在 totalRevenue 财务口径中（金额无 PII）。
 */

import { store } from "@/lib/db";

/** 印象索引（sessionId|productId → 最近一次印象的变体与时间） */
function lastImpressionIndex() {
  const idx = new Map();
  for (const s of store("recTrainingSet")) {
    if (!s.sessionId || !s.productId) continue; // GDPR 脱关联样本失配
    const key = s.sessionId + "|" + s.productId;
    const prev = idx.get(key);
    if (!prev || new Date(s.ts) > new Date(prev.at)) {
      idx.set(key, { variant: s.variant || "baseline", at: s.ts });
    }
  }
  return idx;
}

/**
 * 推荐归因报告 —— 印象 → 成交的 last-touch join
 * 口径：
 *   - 只算 paid 订单（pending_payment 不是收入）
 *   - 印象时间必须 ≤ 成交时间（推荐在成交之后出现 → 属于回访行为，不算）
 *   - 同商品多次印象取最近一次（last-touch），变体归属同此口径
 * @returns 归因摘要 + 分变体收入（哪个变体的印象最终变成了钱）
 */
export function attributeRevenue() {
  const idx = lastImpressionIndex();

  let totalRevenue = 0;
  let totalOrders = 0;
  let attributedRevenue = 0;
  let attributedItems = 0;
  const attributedOrderIds = new Set();
  const byVariant = {}; // variant -> {items, revenue, orders: Set}

  for (const o of store("orders").values()) {
    if (o.status !== "paid") continue;
    const orderRevenue = Number(o.totals?.total) || 0;
    totalRevenue += orderRevenue;
    totalOrders++;
    if (!o.sessionId) continue; // GDPR 脱关联订单只进财务口径，不参与归因

    for (const i of o.items) {
      const hit = idx.get(o.sessionId + "|" + i.productId);
      if (!hit || new Date(hit.at) > new Date(o.createdAt)) continue;
      const line = Number(i.lineTotal) || 0;
      attributedRevenue += line;
      attributedItems++;
      attributedOrderIds.add(o.id);
      const agg = byVariant[hit.variant] || (byVariant[hit.variant] = { items: 0, revenue: 0, orders: new Set() });
      agg.items++;
      agg.revenue += line;
      agg.orders.add(o.id);
    }
  }

  return {
    attributed: {
      revenue: Math.round(attributedRevenue * 100) / 100,
      items: attributedItems,
      orders: attributedOrderIds.size,
    },
    total: {
      revenue: Math.round(totalRevenue * 100) / 100,
      orders: totalOrders,
    },
    // 推荐渗透率：归因收入 / 总收入（注意：这是"在场率"不是"因果增量"）
    attributedRevenuePct: totalRevenue ? Math.round((attributedRevenue / totalRevenue) * 1000) / 10 : null,
    revenueByVariant: Object.entries(byVariant)
      .map(([variant, a]) => ({
        variant,
        items: a.items,
        revenue: Math.round(a.revenue * 100) / 100,
        orders: a.orders.size,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    note: "归因=在场渗透率（高估增量）；真实增量看 rec.lift 里 control 臂与个性化臂的转化率差",
  };
}

/** 域健康快照 —— 监控看板 / overview API */
export function attributionStats() {
  return attributeRevenue();
}
