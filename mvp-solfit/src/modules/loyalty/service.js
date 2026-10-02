/**
 * modules/loyalty — 会员/积分/优惠码域（模块化单体 · Phase 19）
 *
 * 会员模型：按累计实付（lifetimeSpend）派生等级，积分倍率是核心权益：
 *   Member  $0    1×   · Silver $300  1.5×  · Gold $800  2×
 * 等级是派生态不落库（lifetimeSpend 是唯一事实），避免双写漂移。
 *
 * 积分口径：
 *   * 赚取：下单 $1 = 1 分 × 倍率（按实付，折后）；评价 +50（Phase 18 联动）
 *   * 抵扣：100 分 = $1，单笔最多抵当单折后金额 10%（防薅羊毛穿透毛利）
 *   * 账户维度 —— 游客不积分（注册即攒分是获客钩子）
 *
 * 优惠码：percent / fixed 两种，最低消费门槛 + 总次数上限 + 有效期；
 * 服务端统一验签计价（前端只展示），订单落 promoCode 快照可对账。
 *
 * 依赖纪律：import auth(boundUserId/store users)/db —— 不经 catalog，
 * order/reviews 调本域，反向不依赖（无环）。
 */

import { store, trackEvent } from "@/lib/db";
import { boundUserId } from "@/modules/auth/service";

const TIERS = [
  { id: "member", name: "Member", minSpend: 0, multiplier: 1 },
  { id: "silver", name: "Silver", minSpend: 300, multiplier: 1.5 },
  { id: "gold", name: "Gold", minSpend: 800, multiplier: 2 },
];

const POINTS_PER_DOLLAR = 100; // 100 分 = $1
const MAX_REDEEM_RATIO = 0.1;  // 单笔抵扣上限：折后金额的 10%
const REVIEW_POINTS = 50;      // 评价奖励（Phase 18 联动）

const tierOf = (lifetimeSpend) =>
  [...TIERS].reverse().find((t) => (lifetimeSpend || 0) >= t.minSpend) || TIERS[0];

const round2 = (n) => Math.round(n * 100) / 100;

function userOf(sessionId) {
  const uid = boundUserId(sessionId);
  const u = uid && store("users").get(uid);
  if (!u) return null;
  // 派生字段默认值（老用户首次进会员体系）
  if (typeof u.points !== "number") u.points = 0;
  if (typeof u.lifetimeSpend !== "number") u.lifetimeSpend = 0;
  return u;
}

// ===== 读路径 =====

/** 当前会话的会员状态（游客返回 loggedIn:false —— 前端据此引导注册） */
export function loyaltyStatus(sessionId) {
  const u = userOf(sessionId);
  if (!u) return { loggedIn: false, points: 0, tier: null, pointsValue: 0 };
  const tier = tierOf(u.lifetimeSpend);
  return {
    loggedIn: true,
    points: u.points,
    lifetimeSpend: round2(u.lifetimeSpend),
    tier: { id: tier.id, name: tier.name, multiplier: tier.multiplier },
    // 抵扣换算与单笔上限（以 $100 订单为例最多抵 $10）
    pointsValue: Math.floor(u.points / POINTS_PER_DOLLAR),
    nextTier: TIERS.find((t) => t.minSpend > u.lifetimeSpend) || null,
  };
}

// ===== 优惠码 =====

const codeKey = (code) => String(code || "").trim().toUpperCase();
const CODE_RE = /^[A-Z0-9]{3,20}$/;

/** 验签 + 计价（checkout quote/place 共用；无效码抛错，route 映射 422） */
export function validatePromo(code, subtotal) {
  const key = codeKey(code);
  const promo = store("promoCodes").get(key);
  if (!promo || !promo.active) throw new Error("INVALID_PROMO");
  if (promo.expiresAt && Date.now() > new Date(promo.expiresAt).getTime()) throw new Error("PROMO_EXPIRED");
  if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) throw new Error("PROMO_EXHAUSTED");
  if (subtotal < (promo.minSpend || 0)) throw new Error("PROMO_MIN_SPEND");

  const discount = promo.type === "percent"
    ? round2(subtotal * (promo.value / 100))
    : round2(Math.min(promo.value, subtotal));
  return { code: key, discount, type: promo.type, value: promo.value, label: promo.label || key };
}

/** 商家创建优惠码（merchant API 调用） */
export function adminCreatePromo({ code, type, value, minSpend = 0, maxUses = 0, expiresAt = null, label = null } = {}) {
  const key = codeKey(code);
  if (!CODE_RE.test(key)) throw new Error("INVALID_PROMO_CODE");
  if (!["percent", "fixed"].includes(type)) throw new Error("INVALID_PROMO_TYPE");
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0 || (type === "percent" && v > 90)) throw new Error("INVALID_PROMO_VALUE");
  if (store("promoCodes").has(key)) throw new Error("PROMO_EXISTS");
  if (maxUses < 0 || Number(maxUses) > 100000) throw new Error("INVALID_PROMO_USES");

  const promo = {
    code: key, type, value: v,
    minSpend: Math.max(0, Number(minSpend) || 0),
    maxUses: Math.floor(Number(maxUses) || 0), // 0 = 不限次
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    label: label ? String(label).slice(0, 60) : null,
    active: true, usedCount: 0,
    createdAt: new Date().toISOString(),
  };
  store("promoCodes").set(key, promo);
  trackEvent("promo_created", { code: key, type, value: v });
  return promo;
}

export function adminListPromos() {
  return [...store("promoCodes").values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function adminSetPromoActive(code, active) {
  const promo = store("promoCodes").get(codeKey(code));
  if (!promo) throw new Error("INVALID_PROMO");
  promo.active = !!active;
  store("promoCodes").set(promo.code, promo);
  return promo;
}

// ===== 结算计价 + 订单结算（order 域调用）=====

/**
 * 结算折扣统一计价（服务端唯一事实）：
 *   promo（折前小计上算）→ points（折后 10% 上限，100 分=$1）
 * 返回 {promoDiscount, pointsDiscount, pointsRedeemed, promo}
 * 任何不合法输入直接抛错 —— order 域原样上抛，结算不降级（宁可不折不可算错）。
 */
export function computeCheckoutDiscounts({ sessionId, subtotal, promoCode, pointsToRedeem }) {
  let promo = null;
  let promoDiscount = 0;
  if (promoCode) {
    promo = validatePromo(promoCode, subtotal); // 无效码 → 抛错（INVALID_PROMO 等）
    promoDiscount = promo.discount;
  }

  let pointsDiscount = 0;
  let pointsRedeemed = 0;
  const want = Math.floor(Number(pointsToRedeem) || 0);
  if (want > 0) {
    const u = userOf(sessionId);
    if (!u) throw new Error("LOGIN_REQUIRED_FOR_POINTS");
    if (want > u.points) throw new Error("INSUFFICIENT_POINTS");
    const cap = Math.floor((subtotal - promoDiscount) * MAX_REDEEM_RATIO * POINTS_PER_DOLLAR); // 分为单位
    pointsRedeemed = Math.min(want, Math.max(0, cap));
    pointsDiscount = round2(pointsRedeemed / POINTS_PER_DOLLAR);
    if (pointsRedeemed <= 0) throw new Error("POINTS_CAP_REACHED");
  }

  return { promo, promoDiscount, pointsDiscount, pointsRedeemed };
}

/**
 * 下单成功的会员结算（createOrder 落单后调用）：
 *   累计实付 → 等级派生 → 积分赚取（实付 × 倍率）→ 积分扣减（抵扣部分）→ 优惠码计数
 * 返回 {earned, tier} 供订单快照。
 */
export function settleOrderLoyalty({ sessionId, orderTotal, promoCode, pointsRedeemed }) {
  const u = userOf(sessionId);
  if (!u) return { earned: 0, tier: null, multiplier: 0 }; // 游客下单不积分
  const tier = tierOf(u.lifetimeSpend); // 结算前等级定倍率（消费后升级下单生效 —— 简单且可解释）

  u.lifetimeSpend = round2((u.lifetimeSpend || 0) + orderTotal);
  const earned = Math.floor(orderTotal * tier.multiplier);
  u.points = (u.points || 0) + earned - (pointsRedeemed || 0);
  if (u.points < 0) u.points = 0; // 防御：并发下单一笔超扣（骨架期单线程不会发生）
  store("users").set(u.id, u);

  if (promoCode) {
    const promo = store("promoCodes").get(codeKey(promoCode));
    if (promo) { promo.usedCount++; store("promoCodes").set(promo.code, promo); }
    trackEvent("promo_applied", { code: promo.code, discount: promo.discount });
  }
  if (earned > 0) trackEvent("points_earned", { points: earned, reason: "order" });
  return { earned, tier: tier.id, multiplier: tier.multiplier };
}

/** 评价奖励（reviews 域 createReview 成功后调用 —— UGC 是积分燃料） */
export function awardReviewPoints(sessionId) {
  const u = userOf(sessionId);
  if (!u) return 0; // 游客评价不积分（同下单口径：注册才攒分）
  u.points += REVIEW_POINTS;
  store("users").set(u.id, u);
  trackEvent("points_earned", { points: REVIEW_POINTS, reason: "review" });
  return REVIEW_POINTS;
}
