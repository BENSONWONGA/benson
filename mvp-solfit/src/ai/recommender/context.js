/**
 * ai/recommender/context.js — 上下文与意图层（Phase 12）
 *
 * 兑现方案文档 §5.1 的承诺："冷启动用规则（热门 + 地区/季节上下文）"——
 * Phase 1 以来冷启动一直是裸 rating 排序，上下文层补上最后一块拼图。
 * 鞋是强季节性品类（凉鞋冬季零转化、靴子春季清不动）—— 上下文信号的
 * 价值在鞋类目录上远高于普通标品。
 *
 * 三类信号（全部可解释、可运营调参，无黑箱）：
 *   1) 地区（inferRegion）：订单 region 优先（已成交的确定性），
 *      Accept-Language 兜底（US / EU / AU）。AU 是南半球 ——
 *      十月的悉尼是春天，十月的纽约是秋天（跨境鞋类电商的经典陷阱）。
 *   2) 季节（seasonOf + SEASONAL_BOOST）：月份 × 半球 → 当季类目亲和。
 *      先验幅度刻意温和（±0.1–0.8，相对 rating 4.5–4.9 的量级）——
 *      先验是"没有数据时的观点"，数据回流（Phase 5 的学习排序）随时可覆盖。
 *   3) 会话意图（sessionIntent）：会话内行为序列的结构化解读 ——
 *      funnel（已加购 = 收银台门口，别再塞广告）> comparing（同类目反复看 =
 *      比价心态，要深度不要广度）> early（首览 = 新客，上下文先验最重要）
 *
 * GDPR：Accept-Language 是非识别性设备信号；region 推断结果不落任何
 * 个人存储，只进计数级看板统计（匿名聚合）。
 */

import { store } from "@/lib/db";

/** 地区先验（温和幅度 —— 数据可覆盖的观点，不是硬规则） */
const REGION_BOOST = {
  US: { Sneakers: 0.1 },                    // 运动鞋文化
  EU: { Loafers: 0.1, Heels: 0.1 },        // 通勤正装文化
  AU: { Sandals: 0.15, Slippers: 0.05 },   // 气候 + 居家文化
};

/** 季节先验（北半球基准；南半球由 seasonOf 翻转后同表取数） */
const SEASONAL_BOOST = {
  spring: { Sneakers: 0.3, Loafers: 0.3, Sandals: 0.1, Boots: -0.2 },
  summer: { Sandals: 0.7, Sneakers: 0.2, Slippers: 0.1, Boots: -0.6, Heels: 0.1 },
  autumn: { Boots: 0.6, Loafers: 0.1, Slippers: 0.2, Sandals: -0.5 },
  winter: { Boots: 0.8, Slippers: 0.4, Sneakers: 0.1, Sandals: -0.8, Heels: -0.1 },
};

const NORTH_SEASON = [ // 月份(1-12) → 北半球季节
  "winter", "winter", "spring", "spring", "spring",
  "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter",
];

/**
 * 地区推断：已成交会话的订单 region 最可信；否则解析 Accept-Language；
 * 全缺省 US（首发市场，方案文档 §4 目标市场）。
 * @param {{sessionId?: string, acceptLanguage?: string}} src
 * @returns {"US"|"EU"|"AU"}
 */
export function inferRegion({ sessionId, acceptLanguage } = {}) {
  if (sessionId) {
    for (const o of store("orders").values()) {
      if (o.sessionId === sessionId && o.region) return o.region; // 订单 region 已是 US/EU 分区口径
    }
  }
  const lang = String(acceptLanguage || "").toLowerCase();
  if (/^(en-au|en-nz)/.test(lang)) return "AU";
  if (/^(de|fr|it|es|nl|sv|da|en-gb|en-ie)/.test(lang)) return "EU";
  return "US";
}

/** 季节：月份 × 半球（AU 走南半球表） */
export function seasonOf(now = new Date(), region = "US") {
  const month = now.getUTCMonth() + 1;
  const north = NORTH_SEASON[month - 1];
  const flip = { spring: "autumn", autumn: "spring", summer: "winter", winter: "summer" };
  return region === "AU" ? flip[north] : north;
}

/**
 * 上下文类目先验 —— 地区 ∘ 季节（两表相加，不互斥）
 * @returns {{ region, season, hemisphere, boosts: Record<string, number> }}
 */
export function contextBoosts({ region = "US", now = new Date() } = {}) {
  const season = seasonOf(now, region);
  const boosts = {};
  const add = (table) => {
    for (const [cat, v] of Object.entries(table)) boosts[cat] = (boosts[cat] || 0) + v;
  };
  add(SEASONAL_BOOST[season]);
  add(REGION_BOOST[region] || {});
  return { region, season, hemisphere: region === "AU" ? "south" : "north", boosts };
}

/**
 * 会话意图 —— 行为序列的结构化解读（越靠近成交，信号越强）：
 *   funnel    已加购：用户在收银台门口 —— rerank 关闭探索槽（Phase 12 联动）
 *   comparing 同类目 ≥2 次浏览：比价心态 —— 比较者要深度（focus 类目配额 +1）
 *   early     浏览 ≤1：新会话 —— 上下文先验是最重要信号，个性化还无料可依
 *   browsing  其余：泛逛 —— 默认多样性
 */
export function sessionIntent(userFeat) {
  const viewed = userFeat?.viewed?.size ?? 0;
  const carted = userFeat?.carted?.size ?? 0;
  if (carted > 0) return { mode: "funnel", focusCategory: null };
  if (viewed >= 2) {
    // 类目聚合计数（features.js 的 categoryAffinity 只存浏览分布，这里重新数）
    const catHits = {};
    if (userFeat?.sessionId) {
      for (const e of store("events")) {
        const p = e.payload || {};
        if (p.sessionId === userFeat.sessionId && e.type === "product_viewed" && p.category) {
          catHits[p.category] = (catHits[p.category] || 0) + 1;
        }
      }
    }
    const focus = Object.entries(catHits).sort((a, b) => b[1] - a[1])[0];
    if (focus && focus[1] >= 2) return { mode: "comparing", focusCategory: focus[0] };
    return { mode: "browsing", focusCategory: focus?.[0] || null };
  }
  if (viewed <= 1) return { mode: "early", focusCategory: null };
  return { mode: "browsing", focusCategory: null };
}

// ===== 看板打点（计数级匿名聚合，无 PII） =====
const _ctx = { calls: 0, regions: {}, intents: {}, lastContext: null };

export function noteContext({ region, season, hemisphere, intent }) {
  _ctx.calls++;
  _ctx.regions[region] = (_ctx.regions[region] || 0) + 1;
  if (intent) _ctx.intents[intent] = (_ctx.intents[intent] || 0) + 1;
  _ctx.lastContext = { region, season, hemisphere, intent, at: new Date().toISOString() };
}

export function contextStats() {
  return {
    calls: _ctx.calls,
    regions: { ..._ctx.regions },
    intents: { ..._ctx.intents },
    last: _ctx.lastContext,
    priors: {
      seasonal: SEASONAL_BOOST,
      regional: REGION_BOOST,
    },
  };
}
