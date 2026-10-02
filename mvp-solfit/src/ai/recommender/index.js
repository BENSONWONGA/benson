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

/** 冷启动规则（保留导出：无任何信号时的兜底，也是 Phase 1 的唯一路径） */
export function coldStartRecommend({ context = {}, excludeId, max = 4 } = {}) {
  let list = listProducts({ sort: "rating" });
  if (excludeId) list = list.filter((p) => p.id !== Number(excludeId));
  if (context.preferCategory) list = list.filter((p) => p.category === context.preferCategory);
  if (context.preferWidth) list = list.filter((p) => p.widths.includes(context.preferWidth));
  return list.slice(0, max);
}

export async function recommend({ sessionId, seedProductId, excludeId, max = 4 } = {}) {
  maybeTrain(); // 惰性训练（60s 节流；印象与标注在 events/recTrainingSet 里等待）

  const userFeat = userFeatures(sessionId);
  const hasHistory = userFeat.viewed.size + userFeat.carted.size + userFeat.ordered.size > 0;
  const seedId = seedProductId != null ? Number(seedProductId) : null;
  const exclude = excludeId != null ? Number(excludeId) : null;

  // 无历史且无种子 → 纯冷启动（不值得进流水线，也不进实验）
  if (!hasHistory && !seedId) {
    const products = coldStartRecommend({ excludeId, max });
    trackEvent("recommend_served", { type: "cold_start", sessionId });
    return products;
  }

  // A/B 灰度：会话确定性分桶（experiments.js）—— 冷启动不受实验影响
  const variant = assignVariant(sessionId) || "baseline";
  noteVariant(variant);

  const cacheKey = ["rec", sessionId || "anon", variant, seedId ?? 0, exclude ?? 0, max].join(":");
  const result = await cacheOrSet(
    cacheKey,
    async () => {
      const all = listProducts();
      const productsById = (id) => all.find((p) => p.id === id);
      // 候选过滤：排除参数/种子/已看/已购/已退换 —— 宁可少推，不重推用户已拒收的商品
      const excluded = new Set(
        [exclude, seedId, ...userFeat.viewed, ...userFeat.carted, ...userFeat.ordered, ...userFeat.returned]
          .filter((v) => v !== null && v !== undefined && !Number.isNaN(v))
      );
      const candidates = all.filter((p) => !excluded.has(p.id));
      if (!candidates.length) {
        return { products: coldStartRecommend({ excludeId, max }), source: "cold_start", ranked: [] };
      }

      const signals = productSignals();

      // 召回：CF（两变体共用）∪ 内容路（baseline=规则 / vector_lr=向量）∪ 热度
      const cfRaw = recallCollaborative(userFeat, sessionInteractions());
      const maxCf = Math.max(0, ...cfRaw.values());
      const cf = new Map([...cfRaw].map(([id, s]) => [id, maxCf ? s / maxCf : 0]));
      const seed = seedId ? all.find((p) => p.id === seedId) : null;
      const content =
        variant === "vector_lr"
          ? recallVector({ seed, userFeat, candidates, productsById }) // 种子向量或档案向量
          : recallContent(seed, candidates); // Phase 3 规则内容路（仅种子驱动）
      const popular = recallPopular(signals, candidates);

      const ranked = rankCandidates(candidates, { cf, content, popular, signals, userFeat });
      // Phase 10 业务重排：尺码可得性闸 + 类目多样性 + 库存深度 + 探索槽位 ——
      // 印象落库与返回商品都用重排后的"真实服务序"（学过的必须是播过的）
      const { items: served, stats: rerank } = rerankCandidates(ranked, { max, userFeat, signals });
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

/** 推荐服务健康快照 —— 监控看板 / overview API（A/B 分流 + 模型质量门 + 实验效果回流 + 重排观测） */
export function recStats() {
  return { experiment: experimentMeta(), model: modelState(), lift: variantLift(), rerank: rerankStats() };
}
