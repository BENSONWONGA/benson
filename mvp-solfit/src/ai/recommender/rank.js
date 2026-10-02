/**
 * ai/recommender/rank.js — 特征排序（CTR 式线性打分）
 *
 * Phase 3 用可解释的线性权重：冷启动期数据稀疏，可解释性 > 可训练性，
 * 每个特征的业务含义都可被运营质询；特征就绪后 Phase 4 原位换
 * lightGBM/DNN —— 输入特征向量、输出排序不变。
 *
 * 特征（全部来自埋点沉淀 + 脚型档案，无外部数据依赖）：
 *   cf       协同过滤召回分（0–1 归一）
 *   content  种子结构相似分
 *   popular  全站热度（0–1 归一）
 *   conv     浏览→成交转化率（CTR 代理，封顶 1）
 *   rating   商品口碑（0–1）
 *   catAff   用户类目亲和（浏览分布）
 *   widthFit 合脚匹配 —— 宽脚档案 × Wide 可穿商品（本站核心差异化特征）
 *   priceFit 常看价位带匹配
 */

const W = {
  cf: 2.0,
  content: 1.4,
  popular: 0.7,
  conv: 1.6,
  rating: 0.8,
  catAff: 1.0,
  widthFit: 1.8,
  priceFit: 0.5,
};

/**
 * @param {Array} candidates   候选商品（已在编排层过滤种子/已购/已退换）
 * @param {Map}   cf           productId -> 归一化 CF 分
 * @param {Map}   content      productId -> 结构相似分
 * @param {Map}   popular      productId -> 热度原始分
 * @param {Map}   signals      productId -> {views,carts,orders,conversion}
 * @param {object} userFeat    userFeatures() 输出
 * @returns [{product, score, reasons[]}] 按分数降序
 */
export function rankCandidates(candidates, { cf, content, popular, signals, userFeat }) {
  const maxPop = Math.max(1, ...popular.values());
  const widthFeel = userFeat.profile?.widthFeel;

  return candidates
    .map((p) => {
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

      const score =
        W.cf * f.cf +
        W.content * f.content +
        W.popular * f.popular +
        W.conv * f.conv +
        W.rating * f.rating +
        W.catAff * f.catAff +
        W.widthFit * f.widthFit +
        W.priceFit * f.priceFit;

      return { product: p, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}
