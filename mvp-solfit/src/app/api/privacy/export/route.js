import { NextResponse } from "next/server";
import { getSessionId, store } from "@/lib/db";
import { exportSessionData as exportMarketingData } from "@/modules/notification/service";
import { exportSessionFeedback } from "@/ai/recommender/feedback";

/**
 * GDPR 数据可携带权 — GET /api/privacy/export
 * 导出本会话关联的全部个人数据（购物车 / 脚型档案 / 订单）。
 * TODO(Phase 2): 账户体系上线后按 userId 全量导出 + 邮件交付
 */
export async function GET(request) {
  const sessionId = getSessionId();
  const orders = [...store("orders").values()].filter((o) => o.sessionId === sessionId)
    .map((o) => ({ ...o, email: mask(o.email) })); // 骨架期脱敏展示
  return NextResponse.json({
    code: 0,
    data: {
      sessionId,
      cart: store("carts").get(sessionId) || { items: [] },
      fitProfile: store("fitProfiles").get(sessionId) || null,
      // 换货/退货训练样本（含冗余档案特征）—— 数据可携带权要求一并导出
      trainingSamples: store("fitTrainingSet").filter((s) => s.sessionId === sessionId),
      // 推荐印象样本（Phase 5 学习排序特征快照）—— 同属个人衍生数据，一并导出
      recImpressions: store("recTrainingSet").filter((s) => s.sessionId === sessionId),
      // 营销订阅与发送历史（Phase 6）—— 邮箱脱敏，与订单导出口径一致
      marketing: exportMarketingData(sessionId),
      // 显式反馈：心愿单 + 不感兴趣列表（Phase 13）—— 用户偏好画像同属个人衍生数据
      feedback: exportSessionFeedback(sessionId),
      orders,
      generatedAt: new Date().toISOString(),
    },
  });
}

function mask(email) {
  if (!email) return null;
  const [name, domain] = email.split("@");
  return name?.slice(0, 2) + "***@" + domain;
}
