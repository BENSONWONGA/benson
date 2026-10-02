import { NextResponse } from "next/server";
import { getSessionId, store, trackEvent } from "@/lib/db";
import { deleteProfile } from "@/modules/customer/service";
import { cacheDelByPrefix } from "@/lib/cache";
import { purgeSessionData as purgeMarketingData } from "@/modules/notification/service";
import { purgeSessionFeedback } from "@/ai/recommender/feedback";

/**
 * GDPR 被遗忘权 — POST /api/privacy/erase
 * 删除本会话全部个人数据：脚型档案 / 购物车 / 会话关联事件。
 * 订单保留金额与状态（财务合规要求），仅抹除 sessionId 关联。
 * 前端 erase 后同时清 localStorage（solfit_fit_profile 等）。
 */
export async function POST(request) {
  const sessionId = getSessionId();
  const removed = {
    fitProfile: deleteProfile(sessionId) ? 1 : 0,
    cart: store("carts").delete(sessionId) ? 1 : 0,
    events: 0,
    trainingSamples: 0,
    recImpressions: 0,
  };

  // 抹除事件流中该会话的个人关联事件（骨架内存版；Phase 2 由数仓按 session 幂等删除）
  const events = store("events");
  let i = events.length;
  while (i--) {
    if (events[i].payload?.sessionId === sessionId) { events.splice(i, 1); removed.events++; }
  }

  // 训练样本脱关联（特征保留、标识抹除 —— 与 PG fit_training_set 表设计一致）
  for (const s of store("fitTrainingSet")) {
    if (s.sessionId === sessionId) { s.sessionId = null; removed.trainingSamples++; }
  }

  // 推荐印象样本同策略脱关联（Phase 5：特征快照非识别性，sessionId 抹除后不再命中标注）
  for (const s of store("recTrainingSet")) {
    if (s.sessionId === sessionId) { s.sessionId = null; removed.recImpressions++; }
  }

  // 订单脱关联（保留财务记录）
  for (const o of store("orders").values()) {
    if (o.sessionId === sessionId) { o.sessionId = null; o.email = null; store("orders").set(o.id, o); }
  }

  // 营销数据三清（Phase 6）：订阅 / 频控账本 / stub 发件箱投递件
  const marketing = purgeMarketingData(sessionId);
  removed.marketingSubscriber = marketing.subscriber;
  removed.marketingLedger = marketing.ledger;
  removed.outboxEmails = marketing.outbox;

  // 显式反馈三清（Phase 13）：心愿单 + 不感兴趣列表 —— 用户偏好画像同样受删除权保护
  // （product_saved / product_disliked 事件已随上方事件流统一删除）
  const feedback = purgeSessionFeedback(sessionId);
  removed.savedItems = feedback.savedItems;
  removed.hiddenItems = feedback.hiddenItems;

  // 本会话个性化推荐缓存立刻失效（否则 60s 内仍返回基于已删数据的推荐）
  await cacheDelByPrefix(`rec:${sessionId}:`);

  trackEvent("profile_erased", { sessionId: null, scope: "erased" }); // 匿名计数
  return NextResponse.json({ code: 0, data: removed });
}
