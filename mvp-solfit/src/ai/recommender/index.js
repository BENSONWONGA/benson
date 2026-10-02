/**
 * ai/recommender — 个性化推荐服务（Phase 3：双路召回 + 特征排序）
 *
 * 演进（与方案文档 §5.1 对齐）：
 *   Phase 1  冷启动规则（rating 排序 + 上下文过滤）—— 保留为降级路径
 *   Phase 3  当前：CF 共现召回 ∪ Content 结构召回 ∪ 热度召回 → CTR 式线性排序
 *   Phase 4  召回层接 ES 向量，排序层原位换 lightGBM/DNN（特征已沉淀）
 *
 * 推荐闭环（退货数据回流的价值兑现）：
 *   1) 已退换商品被排除出个性化推荐 —— 负反馈即刻生效
 *   2) 尺码引擎 V3 用同一份数据修正楦型偏码（见 ai/size-engine）
 *
 * recommend({sessionId, seedProductId, excludeId, max}) 路由策略：
 *   有行为历史      → personalized（CF + 合脚档案 + 类目亲和）
 *   无历史但有种子  → seed_content（PDP 访客也有结构相似好推荐）
 *   全无           → cold_start（rating 兜底）
 */

import { listProducts } from "@/modules/catalog/service";
import { trackEvent } from "@/lib/db";
import { cacheOrSet } from "@/lib/cache";
import { userFeatures, productSignals, sessionInteractions } from "./features";
import { recallCollaborative, recallContent, recallPopular } from "./recall";
import { rankCandidates } from "./rank";

/** 冷启动规则（保留导出：无任何信号时的兜底，也是 Phase 1 的唯一路径） */
export function coldStartRecommend({ context = {}, excludeId, max = 4 } = {}) {
  let list = listProducts({ sort: "rating" });
  if (excludeId) list = list.filter((p) => p.id !== Number(excludeId));
  if (context.preferCategory) list = list.filter((p) => p.category === context.preferCategory);
  if (context.preferWidth) list = list.filter((p) => p.widths.includes(context.preferWidth));
  return list.slice(0, max);
}

export async function recommend({ sessionId, seedProductId, excludeId, max = 4 } = {}) {
  const userFeat = userFeatures(sessionId);
  const hasHistory = userFeat.viewed.size + userFeat.carted.size + userFeat.ordered.size > 0;
  const seedId = seedProductId != null ? Number(seedProductId) : null;
  const exclude = excludeId != null ? Number(excludeId) : null;

  // 无历史且无种子 → 纯冷启动（不值得进流水线）
  if (!hasHistory && !seedId) {
    const products = coldStartRecommend({ excludeId, max });
    trackEvent("recommend_served", { type: "cold_start", sessionId });
    return products;
  }

  const cacheKey = ["rec", sessionId || "anon", seedId ?? 0, exclude ?? 0, max].join(":");
  const result = await cacheOrSet(
    cacheKey,
    async () => {
      const all = listProducts();
      // 候选过滤：排除参数/种子/已看/已购/已退换 —— 宁可少推，不重推用户已拒收的商品
      const excluded = new Set(
        [exclude, seedId, ...userFeat.viewed, ...userFeat.carted, ...userFeat.ordered, ...userFeat.returned]
          .filter((v) => v !== null && v !== undefined && !Number.isNaN(v))
      );
      const candidates = all.filter((p) => !excluded.has(p.id));
      if (!candidates.length) {
        return { products: coldStartRecommend({ excludeId, max }), source: "cold_start" };
      }

      const signals = productSignals();

      // 召回三路：CF（有行为才有分）∪ 内容相似（有种子才有分）∪ 全站热度
      const cfRaw = recallCollaborative(userFeat, sessionInteractions());
      const maxCf = Math.max(0, ...cfRaw.values());
      const cf = new Map([...cfRaw].map(([id, s]) => [id, maxCf ? s / maxCf : 0]));
      const seed = seedId ? all.find((p) => p.id === seedId) : null;
      const content = recallContent(seed, candidates);
      const popular = recallPopular(signals, candidates);

      const ranked = rankCandidates(candidates, { cf, content, popular, signals, userFeat });
      return {
        products: ranked.slice(0, max).map((r) => ({
          ...r.product,
          recScore: Math.round(r.score * 100) / 100, // 调试可见（真实分数量级无业务含义）
          recReasons: r.reasons, // 可解释性：每个推荐位都能回答"为什么推它"
        })),
        source: hasHistory ? "personalized" : "seed_content",
      };
    },
    60 // 60s：埋点高频变化，长缓存会放大学过拟合
  );

  trackEvent("recommend_served", { type: result.source, sessionId, seedId });
  return result.products;
}

/** 弃购召回文案生成钩子 —— 接 ai/content 后由 LLM 个性化 */
export async function abandonedCartHook() {
  // TODO(Phase 4): 事件流消费 → 弃购人群 → LLM 个性化文案 → 邮件 SaaS 触发
  return { enabled: false, note: "Wire to event stream + email provider in Phase 4" };
}
