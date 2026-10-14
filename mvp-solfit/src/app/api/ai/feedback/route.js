import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/db";
import { saveItem, unsaveItem, dislikeItem, undoDislike, getFeedback, invalidateRecCache } from "@/ai/recommender/feedback";
import { observed } from "@/lib/observe";

/**
 * GET  /api/ai/feedback — 本会话反馈状态（心愿单商品快照 + 不感兴趣 ID）
 * POST /api/ai/feedback — 提交显式反馈（Phase 13）
 *   body: {action: "save"|"unsave"|"dislike"|"undo_dislike", productId}
 *
 * 语义（见 feedback.js 头注释）：
 *   save     保存进心愿单 → 出列轮播 + 成为内容召回锚点（"因为你保存过X"）
 *   dislike  不感兴趣   → 全推荐路径硬排除（含对照臂/冷启动 —— 用户控制权优先于测量纯度）
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  return observed("ai-feedback", async () => {
    return NextResponse.json({ code: 0, data: getFeedback(getSessionId()) });
  });
}

export async function POST(request) {
  return observed("ai-feedback", async () => {
    const sessionId = getSessionId();
    const body = await request.json().catch(() => ({}));
    const productId = Number(body?.productId);
    if (!Number.isFinite(productId)) {
      return NextResponse.json({ code: 400, message: "productId required" }, { status: 400 });
    }
    try {
      const actions = { save: saveItem, unsave: unsaveItem, dislike: dislikeItem, undo_dislike: undoDislike };
      const fn = actions[body?.action];
      if (!fn) {
        return NextResponse.json({ code: 400, message: "action must be save|unsave|dislike|undo_dislike" }, { status: 400 });
      }
      const data = fn(sessionId, productId);
      await invalidateRecCache(sessionId); // "不再展示"/出列立刻生效 —— 不等 60s 缓存过期
      return NextResponse.json({ code: 0, data });
    } catch (err) {
      return NextResponse.json({ code: 422, message: err.message }, { status: 422 });
    }
  });
}
