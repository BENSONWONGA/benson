/**
 * ai/recommender/rerank.js — 业务重排（Phase 10：召回 → 排序 → 重排 的最后一层）
 *
 * 排序层（rank.js）只回答"哪个商品分数最高"；重排层回答"这一屏怎么摆最好"。
 * 工业推荐系统的共识：排序分最高的前 K 个直接上屏，转化率往往不是最高 ——
 * 最后 5% 的业务约束比再高的模型精度更值钱：
 *
 *   1) 尺码可得性闸（硬约束，本站特有）：
 *      档案用户推"无我的码"商品 = 必然浪费的印象位 —— 鞋类推荐位上
 *      "看得到买不了"比"少一个推荐"伤害更大（转化与信任双输；
 *      骨子里这正是"尺码电商"与普通货架的差异）。无档案会话不做硬闸
 *      （冷访客不误伤），库存只有静态 oos 数组兜底判断。
 *   2) 类目多样性：同屏同类目最多 cap 个（默认 ceil(max/2)）——
 *      全 Sneakers 的"Complete the look"轮播是排序层贪心的典型病。
 *      放不下不硬塞：候选耗尽后忽略 cap 回填（空位比重复更伤）。
 *   3) 库存深度软信号：同分之下深库存优先（能履约），单码尾货降权
 *      （供给脆弱，推爆了也是客诉）。软信号不动闸 —— 清库存是
 *      营销侧（Phase 8 人群）的决策，不是推荐侧的。
 *   4) 探索槽位：末位留给"合格但曝光最少"的商品 —— 目录覆盖度是
 *      长尾学习的燃料（没有曝光就没有回流样本，Phase 5 的
 *      学习排序只能学见过的商品）。
 *
 * 签名约定：输入 rank.js 的降序行，输出"真实服务序"—— recommend() 的
 * 印象落库（logImpression）必须用重排后的顺序，否则学习的是没服务过的排序。
 *
 * 演进：多样性的 cap 可换 MMR/DPX，探索可换 Thompson sampling —— 签名不变。
 */

import { getStock } from "@/modules/inventory/service";

const STOCK_DEPTH_WEIGHT = 0.3; // 软信号幅度：深度差最大贡献 ±0.3 分（不越过大分差）
const STOCK_DEEP_QTY = 5;       // ≥5 双该码库存视为"供给充足"

/** 累计重排计数（看板观测：闸/多样性/探索的实际作用频次） */
const _totals = { sizeFiltered: 0, diversityDeferred: 0, exploreSlots: 0, stockAdjusted: 0 };

export function rerankStats() {
  return { ..._totals };
}

/**
 * 重排主入口
 * @param {[{product, score, features, reasons}]} ranked rank.js 输出（分数降序）
 * @param {{max: number, userFeat: object, signals: Map, intent?: object}} ctx
 *   intent（Phase 12 context.js）：
 *     funnel   已加购 —— 探索槽关闭（收银台门口不塞广告：用户在决策，不是在发现）
 *     comparing 比价中 —— focus 类目配额 +1（比较者要深度：同类目多看两双是服务，不是复读）
 * @returns {{items: ranked[], stats: object}} items = 最终服务序（≤ max）
 */
export function rerankCandidates(ranked, { max = 4, userFeat, signals, intent }) {
  const stats = { sizeFiltered: 0, diversityDeferred: 0, exploreSlots: 0, stockAdjusted: 0 };
  const profileSize = userFeat.profile?.recommendation?.size || null;

  // ===== 1) 尺码可得性闸（硬约束；无档案会话跳过） =====
  let gated = ranked;
  if (profileSize) {
    const pass = ranked.filter((r) => {
      const ok = getStock(r.product.id, profileSize) > 0;
      if (!ok) stats.sizeFiltered++;
      return ok;
    });
    // 全军覆没（极端：尺码全线缺货）→ 不硬闸到底，宁可推"可以看看"也不能空屏
    gated = pass.length >= Math.min(2, max) ? pass : ranked;
    if (gated !== ranked) {
      for (const r of gated) r.reasons.push("available in your size"); // 可解释性：闸的正面陈述
    }
  }

  // ===== 2) 库存深度软信号（在多样性选择前生效 —— 深度影响选择顺序） =====
  const adjusted = gated.map((r) => {
    const qty = profileSize ? getStock(r.product.id, profileSize) : null;
    if (qty === null) return { ...r, adjScore: r.score };
    const depth = Math.min(qty, STOCK_DEEP_QTY) / STOCK_DEEP_QTY; // 0–1
    const adj = r.score + STOCK_DEPTH_WEIGHT * (depth - 0.5); // 深库存 ±0.15 内浮动
    if (qty >= STOCK_DEEP_QTY && r.score !== adj) {
      stats.stockAdjusted++;
      r.reasons.push("well stocked in your size");
    }
    return { ...r, adjScore: adj };
  });
  adjusted.sort((a, b) => b.adjScore - a.adjScore);

  // ===== 3) 类目多样性（贪心 + 耗尽回填；Phase 12 意图联动配额） =====
  const baseCap = Math.max(1, Math.ceil(max / 2)); // max=4 → 每类目最多 2 个
  const capFor = (cat) =>
    baseCap + (intent?.mode === "comparing" && cat === intent.focusCategory ? 1 : 0); // 比较者要深度
  const catCount = {};
  const picked = [];
  const deferred = [];
  for (const r of adjusted) {
    const c = r.product.category;
    if (picked.length < max && (catCount[c] || 0) < capFor(c)) {
      if (capFor(c) > baseCap) r.reasons.push("another look in the category you're comparing"); // 可解释：配额为何放宽
      picked.push(r);
      catCount[c] = (catCount[c] || 0) + 1;
    } else if (picked.length < max) {
      deferred.push(r); // 暂缓：类目已满，等回填
      stats.diversityDeferred++;
    } else {
      deferred.push(r); // 溢出候选（探索槽位备用）
    }
  }
  // 回填（候选耗尽仍没填满 → 忽略 cap；空位比类目重复更伤）
  let di = 0;
  while (picked.length < max && di < deferred.length) picked.push(deferred[di++]);

  // ===== 4) 探索槽位（末位 = 曝光最少的合格候选；funnel 意图下关闭） =====
  if (intent?.mode === "funnel") {
    // 已加购 = 收银台门口不塞广告：用户在决策不是在发现，末位留给强转化候选
  } else if (deferred.length > di && picked.length === max && max >= 3) {
    const pool = deferred.slice(di); // 未被选中的合格候选
    if (pool.length) {
      const views = (r) => signals?.get(r.product.id)?.views ?? 0;
      let least = pool[0];
      for (const r of pool) if (views(r) < views(least)) least = r;
      // 替换末位（末位是排序最弱位，机会成本最小）
      const replaced = picked.pop();
      picked.push({ ...least, explore: true });
      least.reasons.push("wildcard pick — discovering new pairs for you");
      stats.exploreSlots++;
      if (replaced && !deferred.includes(replaced)) deferred.push(replaced);
    }
  }

  _totals.sizeFiltered += stats.sizeFiltered;
  _totals.diversityDeferred += stats.diversityDeferred;
  _totals.exploreSlots += stats.exploreSlots;
  _totals.stockAdjusted += stats.stockAdjusted;

  return { items: picked, stats };
}
