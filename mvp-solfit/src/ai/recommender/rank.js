/**
 * ai/recommender/rank.js — 特征排序（Phase 15：统一打分出口）
 *
 * Phase 3 起特征表冻结为 8 维（cf/content/popular/conv/rating/catAff/widthFit/
 * priceFit），Phase 5 起 "特征已沉淀 → 原位换模型，输入特征向量、输出排序不变"；
 * Phase 15 兑现到位：打分只经 model.predictScore 一个出口 ——
 *   冷模型/质量门未过 → 规则权重（Phase 3 人工权重，模型冷启动期一律规则兜底）
 *   模型 warm        → LR 或 GBDT（model.js 双候选择优上岗，数据回流驱动）
 * 换 DNN 时只改 model.js 内部分支，特征表、本文件、调用方零改动。
 *
 * 特征（全部来自埋点沉淀 + 脚型档案，无外部数据依赖）：
 *   cf       协同过滤召回分（0–1 归一）
 *   content  结构相似分（baseline: 规则分 / vector_lr: 余弦×3，同量纲）
 *   popular  全站热度（0–1 归一）
 *   conv     浏览→成交转化率（CTR 代理，封顶 1）
 *   rating   商品口碑（0–1）
 *   catAff   用户类目亲和（浏览分布）
 *   widthFit 合脚匹配 —— 宽脚档案 × Wide 可穿商品（本站核心差异化特征）
 *   priceFit 常看价位带匹配
 */

import { predictScore } from "./model";

/**
 * 特征抽取（两路径共用）—— 返回行含 features，供印象落库（model.logImpression）
 * @returns [{product, features, reasons[]}]
 */
export function extractFeatureRows(candidates, { cf, content, popular, signals, userFeat }) {
  const maxPop = Math.max(1, ...popular.values());
  const widthFeel = userFeat.profile?.widthFeel;

  return candidates.map((p) => {
    const reasons = [];
    const f = {
      cf: cf.get(p.id) || 0,
      content: content.get(p.id) || 0,
      popular: 0,
      conv: 0,
      rating: p.rating / 5,
      catAff: userFeat.categoryAffinity[p.category] || 0,
      widthFit: 0,
      priceFit: 0,
    };

    if (f.cf > 0) reasons.push("shoppers like you also viewed");
    if (f.content > 1.5) reasons.push("similar fit to this pair");

    f.popular = (popular.get(p.id) || 0) / maxPop;
    if (f.popular >= 0.6) reasons.push("popular this week");

    const sig = signals.get(p.id);
    f.conv = sig ? Math.min(sig.conversion, 1) : 0;

    // 宽脚档案：Wide 可穿 +1（强烈优先）；仅 Standard -1（强抑制 —— 推宽脚用户
    // 穿不进的标准楦是退货率的主要来源，负分比过滤更平滑）
    if (widthFeel === "Wide") {
      f.widthFit = p.widths.includes("Wide") ? 1 : -1;
      if (f.widthFit > 0) reasons.push("built for wide feet");
    }

    if (userFeat.medianPrice && Math.abs(p.price - userFeat.medianPrice) / userFeat.medianPrice <= 0.4) {
      f.priceFit = 1;
    }

    return { product: p, features: f, reasons };
  });
}

/**
 * 排序主入口 —— 签名与 Phase 3 完全一致（调用方 index.js 零感知）
 * @returns [{product, score, features, reasons[]}] 按分数降序
 *
 * Phase 15：打分走 model.predictScore 统一出口 —— 现役模型可插拔
 * （规则 / LR / GBDT，质量门择优），本文件与特征契约零改动。
 */
export function rankCandidates(candidates, ctx) {
  const rows = extractFeatureRows(candidates, ctx);
  return rows
    .map((r) => ({ ...r, score: predictScore(r.features) }))
    .sort((a, b) => b.score - a.score);
}
