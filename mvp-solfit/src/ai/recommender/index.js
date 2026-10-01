/**
 * ai/recommender — 个性化推荐服务（P1）
 * 演进：冷启动规则（当前）→ 召回+排序（Phase 2）
 * 前置条件：埋点事件流（lib/db.trackEvent）—— 现在埋对，Phase 2 才有训练燃料
 */

import { listProducts } from "@/modules/catalog/service";
import { trackEvent } from "@/lib/db";

/**
 * 冷启动推荐：热门 + 上下文
 * TODO(Phase 2): 双路召回（协同过滤 + 商品向量相似）→ CTR 排序模型
 *   召回:   candidates = cf(user_events) ∪ content_sim(seed_product)
 *   排序:   rank = lightGBM/DNN(ctr_features)  —— 特征来自 trackEvent 沉淀
 */
export function coldStartRecommend({ context = {}, excludeId, max = 4 } = {}) {
  trackEvent("ai.recommend_served", { context, type: "cold_start" });

  let list = listProducts({ sort: "rating" });
  if (excludeId) list = list.filter((p) => p.id !== Number(excludeId));

  // 上下文规则（Phase 1 够用）：类目/跟高偏好直接过滤
  if (context.preferCategory) list = list.filter((p) => p.category === context.preferCategory);
  if (context.preferWidth) list = list.filter((p) => p.widths.includes(context.preferWidth));

  return list.slice(0, max);
}

/** 弃购召回文案生成钩子 —— 接 ai/content 后由 LLM 个性化 */
export async function abandonedCartHook() {
  // TODO(Phase 2): 事件流消费 → 弃购人群 → LLM 个性化文案 → 邮件 SaaS 触发
  return { enabled: false, note: "Wire to event stream + email provider in Phase 2" };
}
