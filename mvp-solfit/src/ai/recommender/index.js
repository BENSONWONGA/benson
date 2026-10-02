/**
 * ai/recommender — 个性化推荐服务（Phase 5：向量召回 + 学习排序 + 灰度分流）
 *
 * 演进（与方案文档 §5.1/§7.3 对齐）：
 *   Phase 1  冷启动规则（rating 排序 + 上下文过滤）—— 保留为降级路径
 *   Phase 3  CF 共现召回 ∪ 规则内容召回 ∪ 热度召回 → 人工权重线性排序
 *   Phase 5  当前：A/B 灰度（experiments.js 确定性分桶）
 *              ├─ baseline  : Phase 3 规则路径（对照组）
 *              └─ vector_lr : 向量内容召回（embeddings.js）+ 在线学习排序（model.js）
 *            模型质量门不过 → 静默降级规则权重（§10："AI 不达标时静默降级"）
 *   Phase 9  实验自治理：bandit.js 按效果回流自动分配变体流量（champion 吃 1-ε）
 *   Phase 10 业务重排：rerank.js 在排序后落最后一道闸 —— 尺码可得性/类目
 *            多样性/库存深度/探索槽位（工业流水线的 召回→排序→重排 完整形态）
 *   Phase 11 价值证明：attribution.js 归因（印象→成交）+ control 对照臂
 *            （固定 5% 无个性化流量）—— 转化率差即推荐系统的真实增量
 *   Next     召回层原位换 ES/pgvector ANN，排序层原位换 GBDT/DNN —— 签名均不变
 *
 * 推荐闭环（退货数据回流的价值兑现）：
 *   1) 已退换商品被排除出个性化推荐 —— 负反馈即刻生效
 *   2) 尺码引擎 V3 用同一份数据修正楦型偏码（见 ai/size-engine）
 *   3) 印象特征快照 → 行为回流标注 → 在线训练 → 排序升级（Phase 5 新增）
 *
 * recommend({sessionId, seedProductId, excludeId, max}) 路由策略：
 *   有行为历史      → personalized（CF + 合脚档案 + 类目亲和）
 *   无历史但有种子  → seed_content（PDP 访客也有结构相似好推荐）
 *   全无           → cold_start（rating 兜底，不进实验）
 */

import { listProducts } from "@/modules/catalog/service";
import { trackEvent } from "@/lib/db";
import { cacheOrSet } from "@/lib/cache";
import { userFeatures, productSignals, sessionInteractions } from "./features";
import { recallCollaborative, recallContent, recallVector, recallPopular } from "./recall";
import { rankCandidates } from "./rank";
import { rerankCandidates, rerankStats } from "./rerank";
import { assignVariant, experimentMeta } from "./experiments";
import { maybeTrain, logImpression, noteVariant, modelState, variantLift } from "./model";
import { attributionStats } from "./attribution";
import { inferRegion, contextBoosts, sessionIntent, noteContext, contextStats } from "./context";
import { savedIdsOf, hiddenIdsOf, latestSavedProduct, feedbackStats } from "./feedback";

/**
 * 冷启动规则（Phase 12 兑现 §5.1："热门 + 地区/季节上下文"）：
 *   热门用 rating 代理（质量热度），上下文 = 地区 ∘ 季节先验（context.js）。
 *   preferCategory/preferWidth 保留既有契约（首页/Shop 筛选场景）。
 */
export function coldStartRecommend({ context = {}, excludeId, max = 4 } = {}) {
  let list = listProducts({ sort: "rating" });
  if (excludeId) list = list.filter((p) => p.id !== Number(excludeId));
  if (context.preferCategory) list = list.filter((p) => p.category === context.preferCategory);
  if (context.preferWidth) list = list.filter((p) => p.widths.includes(context.preferWidth));
  // 上下文先行，质量兜底：rating 相近的商品按当季/当区先验重排（幅度温和，可被数据覆盖）
  if (context.boosts && Object.keys(context.boosts).length) {
    list = [...list].sort(
      (a, b) => b.rating + (context.boosts[b.category] || 0) - (a.rating + (context.boosts[a.category] || 0))
    );
  }
  return list.slice(0, max);
}

export async function recommend({ sessionId, seedProductId, excludeId, max = 4, acceptLanguage } = {}) {
  maybeTrain(); // 惰性训练（60s 节流；印象与标注在 events/recTrainingSet 里等待）

  const userFeat = userFeatures(sessionId);
  const hasHistory = userFeat.viewed.size + userFeat.carted.size + userFeat.ordered.size > 0;
  const seedId = seedProductId != null ? Number(seedProductId) : null;
  const exclude = excludeId != null ? Number(excludeId) : null;

  // Phase 13 显式反馈：不感兴趣 = 全路径硬排除（用户控制权）；心愿单 = 出列但作召回锚
  const hidden = hiddenIdsOf(sessionId);
  const saved = savedIdsOf(sessionId);

  // Phase 12 上下文与意图：地区（订单 > Accept-Language > 默认US）∘ 季节（南北半球）
  const region = inferRegion({ sessionId, acceptLanguage });
  const ctx = contextBoosts({ region });
  const intent = sessionIntent(userFeat);
  noteContext({ region: ctx.region, season: ctx.season, hemisphere: ctx.hemisphere, intent: intent.mode });

  // 无历史且无种子 → 纯冷启动（不值得进流水线，也不进实验；上下文先验是唯一有效信号）
  if (!hasHistory && !seedId) {
    // "不再展示"在冷启动同样生效 —— 用户控制权优先于一切；超采 hidden.size 保证
    // 隐藏后仍回填满 max 个坑位（被隐藏的是用户的坑位损失，不是推荐位空缺）
    const products = coldStartRecommend({ context: { boosts: ctx.boosts }, excludeId, max: max + hidden.size })
      .filter((p) => !hidden.has(p.id))
      .slice(0, max);
    trackEvent("recommend_served", { type: "cold_start", sessionId });
    return products;
  }

  // A/B 灰度：会话确定性分桶（experiments.js）—— 冷启动不受实验影响
  const variant = assignVariant(sessionId) || "baseline";
  noteVariant(variant);

  // Phase 11 增量测量臂：固定小流量走"无个性化"服务（rating 榜单 + 公平排除）。
  // 印象照落（variant=control）供 variantLift/归因对照；不走缓存/召回/排序/重排 ——
  // 它是测量基线不是体验优化对象；个性化臂与它的转化率差 = 推荐系统的真实增量。
  if (variant === "control") {
    const excludedViewed = new Set([...userFeat.viewed, ...userFeat.ordered, ...userFeat.returned]);
    const pool = listProducts().filter(
      (p) =>
        !excludedViewed.has(p.id) &&
        !hidden.has(p.id) && // 尊重"不再展示"是用户控制不是个性化 —— 对照臂同样生效
        p.id !== exclude &&
        p.id !== seedId // 公平对照：同样不推刚看过的/已退换的
    );
    const products = pool.sort((a, b) => b.rating - a.rating).slice(0, max);
    logImpression({ sessionId, variant, ranked: products.map((p) => ({ product: p })), max });
    trackEvent("recommend_served", { type: "holdout_control", sessionId, variant });
    return products;
  }

  // 缓存键含 region：同会话跨地区请求（订单迁移/代理变更）不共享错季结果
  const cacheKey = ["rec", sessionId || "anon", variant, seedId ?? 0, exclude ?? 0, max, ctx.region].join(":");
  const result = await cacheOrSet(
    cacheKey,
    async () => {
      const all = listProducts();
      const productsById = (id) => all.find((p) => p.id === id);
      // 候选过滤：排除参数/种子/已看/已购/已退换/不感兴趣/心愿单 ——
      // 心愿单出列（已"捕获"不占坑位）但转入召回锚；不感兴趣是用户亲口的"别推这个"
      const excluded = new Set(
        [exclude, seedId, ...userFeat.viewed, ...userFeat.carted, ...userFeat.ordered, ...userFeat.returned, ...hidden, ...saved]
          .filter((v) => v !== null && v !== undefined && !Number.isNaN(v))
      );
      const candidates = all.filter((p) => !excluded.has(p.id));
      if (!candidates.length) {
        return {
          products: coldStartRecommend({ context: { boosts: ctx.boosts }, excludeId, max: max + hidden.size })
            .filter((p) => !hidden.has(p.id))
            .slice(0, max),
          source: "cold_start",
          ranked: [],
        };
      }

      const signals = productSignals();

      // 召回：CF（两变体共用）∪ 内容路（baseline=规则 / vector_lr=向量）∪ 当季热度（Phase 12）
      const cfRaw = recallCollaborative(userFeat, sessionInteractions());
      const maxCf = Math.max(0, ...cfRaw.values());
      const cf = new Map([...cfRaw].map(([id, s]) => [id, maxCf ? s / maxCf : 0]));
      // Phase 13：保存品锚点 —— 无 PDP 种子时，最近保存的心愿单品担任内容召回锚
      // （save = 未购会话最强的意向声明，比浏览锚定的"为什么推它"清晰两个信噪级）
      const savedAnchor = !seedId ? latestSavedProduct(sessionId) : null;
      const seed = seedId ? all.find((p) => p.id === seedId) : null;
      const anchor = seed || savedAnchor;
      const content =
        variant === "vector_lr"
          ? recallVector({ seed: anchor, userFeat, candidates, productsById }) // 种子/保存品向量或档案向量
          : recallContent(anchor, candidates); // Phase 3 规则内容路（种子或保存品驱动）
      const popular = recallPopular(signals, candidates, { seasonal: ctx.boosts });

      const ranked = rankCandidates(candidates, { cf, content, popular, signals, userFeat });
      // Phase 10 业务重排 + Phase 12 意图联动：尺码可得性闸 + 类目多样性 + 库存深度 + 探索槽位；
      // funnel 关探索（收银台门口不塞广告）、comparing 加深 focus 类目配额 ——
      // 印象落库与返回商品都用重排后的"真实服务序"（学过的必须是播过的）
      const { items: served, stats: rerank } = rerankCandidates(ranked, { max, userFeat, signals, intent });
      // Phase 13 保存品锚点的可解释性：锚点生效时，高内容分的推荐位溯源到"你保存过的那双"
      if (savedAnchor) {
        for (const r of served) {
          if ((r.features?.content || 0) > 1.5) r.reasons.push(`inspired by the ${savedAnchor.name} you saved`);
        }
      }
      return {
        products: served.map((r) => ({
          ...r.product,
          recScore: Math.round(r.score * 100) / 100, // 调试可见（真实分数量级无业务含义）
          recReasons: r.reasons, // 可解释性：每个推荐位都能回答"为什么推它"
        })),
        source: hasHistory ? "personalized" : "seed_content",
        variant,
        ranked: served, // ≤max 的最终服务序（logImpression 直接用）
        rerank,
      };
    },
    60 // 60s：埋点高频变化，长缓存会放大学过拟合
  );

  // 印象特征快照落库 —— 学习排序的训练燃料（含 variant，供实验效果回流分析）
  if (result.ranked?.length) {
    logImpression({ sessionId, variant, ranked: result.ranked, max });
  }

  trackEvent("recommend_served", { type: result.source, sessionId, seedId, variant });
  return result.products;
}

/** 推荐服务健康快照 —— 监控看板 / overview API（分流 + 质量门 + 效果回流 + 重排 + 归因 + 上下文 + 显式反馈） */
export function recStats() {
  return {
    experiment: experimentMeta(),
    model: modelState(),
    lift: variantLift(),
    rerank: rerankStats(),
    attribution: attributionStats(),
    context: contextStats(),
    feedback: feedbackStats(), // Phase 13：save/dislike 采用量（控制权使用率 = 功能被真实使用的证据）
  };
}
