/**
 * modules/reviews — 商品评价域（模块化单体 · Phase 18）
 *
 * 设计要点：
 *   * 已购验证（verified purchase）：只有真实买过该商品才能评 —— 游客按
 *     本会话订单、账户按 userId（跨设备订单全认）。未购提交 → 409。
 *   * 一人一评：同 session 同商品仅一条（换货单可评 —— 真实穿过即有发言权）。
 *   * fit 反馈（too_small / true_to_size / too_large）真实化商品 fitStats ——
 *     兑现 catalog 域 Phase 17 注释："fitStats 属评价域"。评分聚合同步回写
 *     product.rating / reviewsCount（尺码引擎与前台排序的展示源）。
 *   * 匿名展示：作者不落 email，账户用昵称（name 或邮箱前缀脱敏），游客
 *     "Guest"。评论正文是 UGC 非识别性数据 —— 保留；sessionId 关联用于
 *     GDPR 删除权（purge 整条删，保守口径）。
 *   * 富素材 SEO：评价 SSR 渲染进商品页（UGC 长尾词是独立站自然流量富矿）。
 */

import { randomUUID } from "crypto";
import { store, trackEvent } from "@/lib/db";
import { boundUserId } from "@/modules/auth/service";
import { allProducts } from "@/modules/catalog/service";
import { awardReviewPoints } from "@/modules/loyalty/service";
import { cacheDel } from "@/lib/cache";

/** 经 catalog 公开函数取商品（触发种子灌入；返回 store 内对象引用供聚合回写） */
function productById(productId) {
  return allProducts().find((p) => p.id === Number(productId)) || null;
}

const FIT_VALUES = ["too_small", "true_to_size", "too_large"];
const RATING_MIN = 1;
const RATING_MAX = 5;
const REVIEWS_CAP = 500; // 骨架期防溢出（Phase 2 落 PG 无上限）

/** 可评价的订单状态（买过且未取消/未支付失败） */
const REVIEWABLE = ["paid", "shipped", "exchanged", "returned"];

/** 找到该会话/用户对某商品的可评依据订单（已购验证 + 幂等查询共用） */
function findPurchase(sessionId, userId, productId) {
  for (const o of store("orders").values()) {
    if (!REVIEWABLE.includes(o.status)) continue;
    const owned = (sessionId && o.sessionId === sessionId) || (userId && o.userId === userId);
    if (!owned) continue;
    if ((o.items || []).some((i) => Number(i.productId) === Number(productId))) return o;
  }
  return null;
}

/** 评价是否已存在（幂等：session 或 userId 维度一条） */
function alreadyReviewed(sessionId, userId, productId) {
  return store("reviews").some(
    (r) =>
      Number(r.productId) === Number(productId) &&
      ((r.sessionId && r.sessionId === sessionId) || (r.userId && userId && r.userId === userId))
  );
}

/** 评分聚合回写商品（rating/reviewsCount/fitStats —— catalog 域约定的写路径） */
function refreshProductAggregate(productId) {
  const product = productById(productId);
  if (!product) return;
  const list = store("reviews").filter((r) => Number(r.productId) === Number(productId));
  const total = list.length;
  const sum = list.reduce((s, r) => s + r.rating, 0);
  product.rating = total ? Math.round((sum / total) * 10) / 10 : 0;
  product.reviewsCount = total;

  // fitStats 真实化：偏码反馈百分比（无 fit 数据时保留原值 —— 种子商品的工厂值）
  const fits = list.filter((r) => r.fit);
  if (fits.length) {
    const small = fits.filter((r) => r.fit === "too_small").length;
    const large = fits.filter((r) => r.fit === "too_large").length;
    const trueN = fits.length - small - large;
    const pct = (n) => Math.round((n / fits.length) * 100);
    product.fitStats = { small: pct(small), true: pct(trueN), large: pct(large) };
  }
  store("products").set(product.id, product);
  cacheDel(`product:${product.id}`); // 前台详情缓存即刻失效（聚合变化）
}

/** 匿名作者名：账户昵称（脱敏）/ 游客 */
function authorNameOf(sessionId, userId) {
  const user = userId && store("users").get(userId);
  if (!user) return "Guest";
  if (user.name) return user.name.split(" ")[0];
  return user.email.slice(0, 2) + "***";
}

// ===== 读路径 =====

/** 商品评价列表（newest first；含 verified 标记 —— 社会证明展示用） */
export function listReviews(productId) {
  return store("reviews")
    .filter((r) => Number(r.productId) === Number(productId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      fit: r.fit,
      verified: r.verified,
      author: r.author,
      createdAt: r.createdAt,
    }));
}

/** 聚合摘要（商品页 SSR + 商家视图）：评分 / 分布 / fitStats */
export function reviewSummary(productId) {
  const product = productById(productId);
  const list = store("reviews").filter((r) => Number(r.productId) === Number(productId));
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of list) distribution[r.rating]++;
  return {
    rating: product?.rating ?? 0,
    reviewsCount: product?.reviewsCount ?? 0,
    distribution,
    fitStats: product?.fitStats ?? null,
  };
}

/** 当前会话是否可评该商品（前端表单展示状态 + 已评标记） */
export function reviewStatus(sessionId, productId) {
  const uid = boundUserId(sessionId);
  const reviewed = alreadyReviewed(sessionId, uid, productId);
  return {
    purchased: !!findPurchase(sessionId, uid, productId),
    reviewed,
    canReview: !reviewed && !!findPurchase(sessionId, uid, productId),
  };
}

// ===== 写路径 =====

/** 发表评价（已购验证 → 幂等 → 落库 → 聚合回写） */
export function createReview(sessionId, { productId, rating, title, body, fit } = {}) {
  if (!sessionId) throw new Error("SESSION_REQUIRED");
  const uid = boundUserId(sessionId);
  const product = productById(productId);
  if (!product) throw new Error("PRODUCT_NOT_FOUND");

  const r = Math.round(Number(rating));
  if (!(r >= RATING_MIN && r <= RATING_MAX)) throw new Error("INVALID_RATING");
  if (fit && !FIT_VALUES.includes(fit)) throw new Error("INVALID_FIT");
  const text = String(body || "").trim();
  if (!text) throw new Error("EMPTY_BODY");
  if (text.length > 2000) throw new Error("BODY_TOO_LONG");

  // 已购验证：没买过不给评（刷评防线 —— UGC 质量是转化率生命线）
  const order = findPurchase(sessionId, uid, productId);
  if (!order) throw new Error("NOT_PURCHASED");
  if (alreadyReviewed(sessionId, uid, productId)) throw new Error("ALREADY_REVIEWED");

  const review = {
    id: randomUUID(),
    productId: product.id,
    sessionId,
    userId: uid,
    orderId: order.id,
    rating: r,
    title: String(title || "").trim().slice(0, 120) || null,
    body: text,
    fit: fit || null,
    verified: true, // 过了 findPurchase 必为已购
    author: authorNameOf(sessionId, uid),
    createdAt: new Date().toISOString(),
  };
  const list = store("reviews");
  list.push(review);
  if (list.length > REVIEWS_CAP) list.shift();

  refreshProductAggregate(product.id);
  // 会员奖励（Phase 19 联动）：登录用户 +50 积分 —— UGC 是积分燃料
  const pointsEarned = awardReviewPoints(sessionId);
  trackEvent("review_created", { productId: product.id, rating: r, verified: true });
  return { id: review.id, rating: review.rating, author: review.author, createdAt: review.createdAt, pointsEarned };
}

// ===== GDPR（privacy erase/export 调用）=====

/** 删除权：该会话评价整条删除 + 聚合刷新（保守口径 —— 评价含个人关联） */
export function purgeSessionReviews(sessionId) {
  const list = store("reviews");
  const affected = new Set();
  let removed = 0;
  let i = list.length;
  while (i--) {
    if (list[i].sessionId === sessionId) {
      affected.add(list[i].productId);
      list.splice(i, 1);
      removed++;
    }
  }
  for (const pid of affected) refreshProductAggregate(pid);
  return removed;
}

/** 可携带权：导出该会话的评价（含全文 —— 用户自己产出的内容） */
export function exportSessionReviews(sessionId) {
  return store("reviews")
    .filter((r) => r.sessionId === sessionId)
    .map((r) => ({
      productId: r.productId, orderId: r.orderId, rating: r.rating,
      title: r.title, body: r.body, fit: r.fit, createdAt: r.createdAt,
    }));
}

/**
 * 账户删除时的评价匿名化（privacy erase 编排调用，非 auth 直调 —— 避免
 * auth↔reviews 循环依赖）：正文是 UGC 资产保留，作者身份脱敏。
 */
export function anonymizeUserReviews(userId) {
  if (!userId) return 0;
  let n = 0;
  for (const r of store("reviews")) {
    if (r.userId === userId) {
      r.userId = null;
      r.sessionId = null;
      r.author = "Deleted user";
      n++;
    }
  }
  return n;
}

// ===== 商家管理（admin API 调用）=====

/** 商家视图：全量评价（newest first，带商品名 —— 审核/运营看板用） */
export function adminListReviews() {
  return [...store("reviews")]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((r) => ({
      id: r.id,
      productId: r.productId,
      productName: productById(r.productId)?.name || `#${r.productId}`,
      rating: r.rating,
      title: r.title,
      body: r.body,
      fit: r.fit,
      verified: r.verified,
      author: r.author,
      createdAt: r.createdAt,
    }));
}

/**
 * 审核删除（UGC 运营）：删单条 + 聚合回写刷新。
 * 与 GDPR purge 同一删除路径 —— 但这是商家侧内容审核（垃圾/违规）。
 */
export function adminRemoveReview(reviewId) {
  const list = store("reviews");
  const idx = list.findIndex((r) => r.id === reviewId);
  if (idx === -1) throw new Error("REVIEW_NOT_FOUND");
  const [removed] = list.splice(idx, 1);
  refreshProductAggregate(removed.productId);
  trackEvent("review_removed", { reviewId, productId: removed.productId });
  return removed;
}
