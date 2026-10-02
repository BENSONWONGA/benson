/**
 * ai/retention/scenarios.js — 复购场景引擎（Phase 7）
 *
 * 站内推荐（recommender）的候选过滤是"别推已买的"；留存推荐恰好相反——
 * 以已购为锚点设计三个复购场景（每个场景 = 一类时机 × 一组候选 × 一套文案）：
 *
 *   repurchase_due     补货到期：鞋是消耗品（缓震中底日常穿着 4-6 个月衰减），
 *                      类目磨损周期到了 → 推同类目替代款（刚性需求，优先级最高）
 *   complete_the_look  搭配互补：衣橱轮换缺位 → 推互补类目
 *                      （互补表优先取自订单共现"买了A类目的人还买B"，数据缺失兜底领域知识）
 *   win_back           挽回：at_risk/lapsed 人群 → 新品 + "档案还在"的温度话术
 *
 * 候选排序只用可解释规则（rating / 宽窄匹配 / 共现强度 / 新品）——
 * 留存 digest 每客只取 3 个商品，学习排序的收益不值得引入模型依赖。
 *
 * GDPR：已购信息来自订单；erase 脱关联后 customerStats 返回 null，场景自然停摆。
 */

import { store } from "@/lib/db";
import { PRODUCTS } from "@/data/products"; // 纯数据源 —— 不经 catalog service（cache/ioredis），instrumentation Edge 依赖图安全
import { getFitProfile } from "@/modules/customer/service";

/** 类目复购周期（天）——领域知识：日常穿着频率 × 磨损速率，运营可调 */
const REPURCHASE_CYCLE_DAYS = {
  Sneakers: 150, // 穿着频率最高，中底衰减最快
  Loafers: 240,
  Heels: 270,
  Boots: 300,
  Sandals: 365, // 季节性
  Slippers: 365,
};

/** 互补类目兜底表（订单共现数据不足时使用；领域知识：衣橱轮换逻辑） */
const COMPLEMENT_FALLBACK = {
  Sneakers: ["Loafers", "Boots"],
  Loafers: ["Sneakers", "Boots"],
  Heels: ["Loafers", "Sneakers"],
  Boots: ["Sneakers", "Loafers"],
  Sandals: ["Sneakers", "Boots"],
  Slippers: ["Sneakers", "Loafers"],
};

/**
 * 互补类目表 —— 订单共现优先（买了A类目还会买B类目的人数），
 * 共现样本不足（<2）时用领域知识兜底。数据驱动优先、规则兜底，
 * 与推荐系统"先规则后模型"的演进铁律同构（方案文档 §9）。
 */
export function categoryComplements() {
  const co = new Map(); // "A|B" → 共现会话数（A≠B，按字典序去重）
  const bySession = new Map();
  for (const o of ordersWithSession()) {
    const cats = bySession.get(o.sessionId) || new Set();
    for (const i of o.items) {
      const cat = PRODUCTS.find((p) => p.id === i.productId)?.category;
      if (cat) cats.add(cat);
    }
    bySession.set(o.sessionId, cats);
  }
  for (const cats of bySession.values()) {
    const list = [...cats];
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const key = [list[a], list[b]].sort().join("|");
        co.set(key, (co.get(key) || 0) + 1);
      }
    }
  }
  const table = {};
  for (const key of Object.keys(COMPLEMENT_FALLBACK)) table[key] = new Set();
  for (const [key, n] of co) {
    if (n < 2) continue; // 单例共现是噪声
    const [a, b] = key.split("|");
    table[a]?.add(b);
    table[b]?.add(a);
  }
  // 兜底并入（Set 去重；共现结果在前 = 优先级更高）
  const out = {};
  for (const [cat, fallback] of Object.entries(COMPLEMENT_FALLBACK)) {
    const learned = [...(table[cat] || [])];
    out[cat] = [...new Set([...learned, ...fallback])];
  }
  return out;
}

function ordersWithSession() {
  return [...store("orders").values()].filter((o) => o.status === "paid" && o.sessionId);
}

/** 各类目最近一次成交时间（补货周期判定） */
export function lastPurchaseByCategory(orders) {
  const last = new Map();
  for (const o of orders) {
    for (const i of o.items) {
      const cat = PRODUCTS.find((p) => p.id === i.productId)?.category;
      if (!cat) continue;
      const prev = last.get(cat);
      if (!prev || new Date(o.createdAt) > new Date(prev)) last.set(cat, o.createdAt);
    }
  }
  return last;
}

/**
 * 场景决策 —— 每客一个场景（digest 一封邮件只讲一件事，转化率高于杂货铺式摘要）
 * 优先级：repurchase_due（刚性）> complete_the_look（弹性）> win_back（人群特化）
 */
export function pickScenario(customer) {
  const lastByCat = lastPurchaseByCategory(customer.orders);
  const cycleOf = (cat, ts) => Math.floor((Date.now() - new Date(ts).getTime()) / (24 * 60 * 60_000));

  // 1) 补货到期：任一已购类目超过磨损周期
  for (const [cat, ts] of lastByCat) {
    const cycle = REPURCHASE_CYCLE_DAYS[cat];
    if (cycle && cycleOf(cat, ts) >= cycle) {
      return { scenario: "repurchase_due", dueCategory: cat, monthsSince: Math.round((cycleOf(cat, ts) / 30) * 10) / 10 };
    }
  }

  // 2) 挽回：at_risk / lapsed 人群优先于泛搭配（人群特化文案）
  if (customer.tier === "at_risk" || customer.tier === "lapsed") {
    return { scenario: "win_back" };
  }

  // 3) 搭配互补：默认场景
  return { scenario: "complete_the_look" };
}

/**
 * 场景候选生成（每场景 3 个商品，附 why 可解释文案）
 * @param {object} customer segmentCustomers 的单客条目
 */
export function scenarioCandidates(customer, decision, { max = 3 } = {}) {
  const all = PRODUCTS;
  const owned = new Set(customer.orders.flatMap((o) => o.items.map((i) => i.productId)));
  const preferWidth = widthOf(customer.sessionId);
  const complements = categoryComplements();

  const score = (p) => {
    let s = p.rating * 2;
    if (p.widths.includes(preferWidth)) s += 1; // 档案宽窄匹配 —— 合脚是本站差异化核心
    if (p.badge === "New") s += 0.5;
    return s;
  };

  let pool = [];
  let why = "";
  if (decision.scenario === "repurchase_due") {
    pool = all.filter((p) => p.category === decision.dueCategory && !owned.has(p.id));
    why = `Fresh ${decision.dueCategory.toLowerCase()} to replace your ${decision.monthsSince}-month-old pair`;
  } else if (decision.scenario === "complete_the_look") {
    const ownedCats = [...new Set(customer.orders.flatMap((o) => o.items.map((i) => all.find((p) => p.id === i.productId)?.category).filter(Boolean)))];
    const compCats = ownedCats.flatMap((c) => complements[c] || []).filter((c) => !ownedCats.includes(c));
    const targetCats = [...new Set(compCats)];
    pool = all.filter((p) => targetCats.includes(p.category) && !owned.has(p.id));
    why = "Completes the rotation your shoe rack is asking for";
  } else {
    // win_back：新品优先（"我们出新品了"是挽回最强的钩子），全类目
    pool = all.filter((p) => !owned.has(p.id));
    why = "New arrivals since your last visit — your size profile is still saved";
  }

  // 池子空（全买过/全缺货）→ 放宽为全目录除已购；再空 → 返回空（调用方跳过该客）
  if (!pool.length) pool = all.filter((p) => !owned.has(p.id));

  return pool
    .sort((a, b) => score(b) - score(a))
    .slice(0, max)
    .map((p) => ({ productId: p.id, name: p.name, category: p.category, price: p.price, why }));
}

/** 档案宽窄偏好（无档案 → null，不加分即可） */
function widthOf(sessionId) {
  const profile = getFitProfile(sessionId);
  return profile?.widthFeel === "Wide" ? "Wide" : "Standard";
}
