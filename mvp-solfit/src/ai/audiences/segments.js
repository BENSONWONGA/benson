/**
 * ai/audiences/segments.js — 一方数据人群构建（Phase 8）
 *
 * 触达侧三件套的最后一环（方案文档 §5.1）：
 *   弃购召回(Phase 6) → 生命周期分层营销(Phase 7) → 广告平台人群扩展(本模块)
 *
 * 五类人群（每类对应一个广告平台的投放用途）：
 *   lookalike_seed     高价值种子：vip/at_risk 已购人群（含 LTV 代理价值分排序），
 *                      供平台"相似受众扩展"找新客 —— 种子质量决定扩量质量
 *   retargeting_viewed 浏览未购再营销：近 N 天看过商品但没买 → DPA 动态商品广告
 *                      （携带 viewedProductIds 供平台目录匹配）
 *   retargeting_cart   弃购再营销：加购未结清 → DPA 最高转化人群
 *   category_lovers     类目偏好：单一类目浏览 ≥2 次的未购人群 → 类目定投
 *   suppression_buyers 已购抑制名单：获客广告必须排除 —— 对已购人群投拉新广告
 *                      是纯烧 CAC（方案文档 §8：CAC 130–156 美元的行业基线下
 *                      抑制名单是最便宜的"降 CAC"手段）
 *
 * GDPR：
 *   - 人群按需实时计算，不落持久存储；erase 后 events/orders/订阅三清，
 *     会话自然出列（与 Phase 6/7 同构的"派生数据跟随源数据"合规模型）
 *   - 邮箱资格与邮件营销同口径：显式订阅 或 复购订单邮箱（resolveAddress）
 *   - 预览只给脱敏邮箱；导出给 SHA-256 哈希（平台规范 + 最小化原则）
 *
 * 依赖边界：只 import db / retention.rfm / notification（全部 Edge 安全——
 * 不经 catalog service，目录取数直接用 @/data/products，与 Phase 7 同款约束）。
 */

import { store } from "@/lib/db";
import { PRODUCTS } from "@/data/products";
import { segmentCustomers } from "@/ai/retention/rfm";
import { resolveAddress } from "@/modules/notification/service";

/** 浏览再营销回看窗口（天）—— 太长的人群转化率衰减，广告平台通行 14–30 天 */
const VIEW_WINDOW_DAYS = 30;

/**
 * LTV 代理价值分（单调、可解释 —— 广告种子排序用，不追求精算）：
 *   value = monetary × frequency × recencyDecay
 *   recencyDecay = 1 / (1 + recencyDays / 90)（90 天半衰式衰减）
 */
export function valueScore(rfm) {
  const decay = 1 / (1 + rfm.recencyDays / 90);
  return Math.round(rfm.monetary * rfm.frequency * decay);
}

/** 事件流 → 会话浏览/加购画像（DPA 与再营销的底料） */
function browseSignals() {
  const viewed = new Map(); // sessionId -> Map(productId -> ts)
  const carted = new Map();
  const cutoff = Date.now() - VIEW_WINDOW_DAYS * 24 * 60 * 60_000;
  for (const e of store("events")) {
    const { sessionId, productId } = e.payload || {};
    if (!sessionId || !productId) continue;
    const ts = new Date(e.ts).getTime();
    if (e.type === "product_viewed" && ts >= cutoff) {
      const m = viewed.get(sessionId) || new Map();
      m.set(productId, ts);
      viewed.set(sessionId, m);
    } else if (e.type === "cart_added" && ts >= cutoff) {
      const m = carted.get(sessionId) || new Map();
      m.set(productId, ts);
      carted.set(sessionId, m);
    }
  }
  return { viewed, carted };
}

/** 统一的会话人群条目（email 资格判定 + 脱敏预览字段） */
function entry(sessionId, extra = {}) {
  const addr = resolveAddress(sessionId);
  return {
    sessionId,
    email: addr ? addr.email : null, // 明文只在服务端导出哈希时用；预览时调用方脱敏
    emailSource: addr ? addr.source : null,
    ...extra,
  };
}

/**
 * 全量人群构建 —— 每个人群 = {id, purpose, size, withEmail, entries}
 * size = 会话数（含无邮箱会话）；withEmail = 可导出邮箱数（平台能吃到的规模）。
 */
export function buildAudiences() {
  const { viewed, carted } = browseSignals();
  const { customers: rfmCustomers } = segmentCustomers();
  const buyers = new Set(rfmCustomers.map((c) => c.sessionId));

  // ===== 1) lookalike_seed：vip + at_risk 已购人群（高价值种子）=====
  const seedCandidates = rfmCustomers
    .filter((c) => c.tier === "vip" || c.tier === "at_risk")
    .map((c) => ({ ...entry(c.sessionId), tier: c.tier, value: valueScore(c.rfm), rfm: c.rfm }))
    .sort((a, b) => b.value - a.value); // 种子按价值降序 —— 导出可截 topN

  // ===== 2) retargeting_viewed：浏览未购（含 DPA 商品清单）=====
  const viewedEntries = [];
  for (const [sessionId, views] of viewed) {
    if (buyers.has(sessionId)) continue; // 已购人群走复购链路（Phase 7），不烧再营销预算
    const productIds = [...views.keys()].map(Number);
    const cats = productIds.map((id) => PRODUCTS.find((p) => p.id === id)?.category).filter(Boolean);
    viewedEntries.push({
      ...entry(sessionId),
      viewedProductIds: productIds, // DPA 动态商品广告的目录匹配素材
      categories: [...new Set(cats)],
    });
  }

  // ===== 3) retargeting_cart：加购且购物车仍非空（弃购 DPA，最高转化）=====
  const cartEntries = [];
  for (const [sessionId, cart] of store("carts")) {
    if (!cart?.items?.length || buyers.has(sessionId)) continue;
    cartEntries.push({
      ...entry(sessionId),
      cartProductIds: cart.items.map((i) => Number(i.productId)),
      cartValue: cart.items.reduce((s, i) => s + (i.qty || 1) * (PRODUCTS.find((p) => p.id === i.productId)?.price || 0), 0),
    });
  }

  // ===== 4) category_lovers：单一类目浏览 ≥2 次的未购人群（类目定投）=====
  const categoryEntries = viewedEntries
    .filter((e) => e.categories.length > 0)
    .map((e) => {
      const catCount = {};
      for (const pid of e.viewedProductIds) {
        const cat = PRODUCTS.find((p) => p.id === pid)?.category;
        if (cat) catCount[cat] = (catCount[cat] || 0) + 1;
      }
      const top = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0];
      return { ...e, topCategory: top?.[0] || e.categories[0], topCategoryViews: top?.[1] || 1 };
    })
    .filter((e) => e.topCategoryViews >= 2);

  // ===== 5) suppression_buyers：已购抑制名单（获客广告排除项）=====
  const suppressionEntries = rfmCustomers.map((c) => ({ ...entry(c.sessionId), tier: c.tier, lastOrderAt: c.rfm.lastOrderAt }));

  const withEmail = (list) => list.filter((e) => e.email).length;
  return [
    {
      id: "lookalike_seed",
      purpose: "高价值相似人群扩展种子（vip/at_risk 已购，按 LTV 代理分排序）",
      size: seedCandidates.length,
      withEmail: withEmail(seedCandidates),
      entries: seedCandidates,
    },
    {
      id: "retargeting_viewed",
      purpose: "浏览未购再营销（DPA 动态商品广告，含浏览商品清单）",
      size: viewedEntries.length,
      withEmail: withEmail(viewedEntries),
      entries: viewedEntries,
    },
    {
      id: "retargeting_cart",
      purpose: "弃购再营销（DPA 最高转化人群，购物车仍非空）",
      size: cartEntries.length,
      withEmail: withEmail(cartEntries),
      entries: cartEntries,
    },
    {
      id: "category_lovers",
      purpose: "类目偏好定投（单一类目浏览 ≥2 次的未购人群）",
      size: categoryEntries.length,
      withEmail: withEmail(categoryEntries),
      entries: categoryEntries,
    },
    {
      id: "suppression_buyers",
      purpose: "已购抑制名单（获客广告必须排除 —— 烧 CAC 的纯浪费）",
      size: suppressionEntries.length,
      withEmail: withEmail(suppressionEntries),
      entries: suppressionEntries,
    },
  ];
}

/** 单人群查询（导出用；不存在返回 null） */
export function getAudience(segmentId) {
  return buildAudiences().find((a) => a.id === segmentId) || null;
}
