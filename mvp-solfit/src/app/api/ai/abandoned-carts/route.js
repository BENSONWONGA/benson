import { NextResponse } from "next/server";
import { abandonedCartHook } from "@/ai/recommender";
import { observed } from "@/lib/observe";

/**
 * GET /api/ai/abandoned-carts — 弃购召回名单（Phase 5，内部运营端点）
 *   ?windowMin= 弃购判定窗口（默认 30 分钟）
 *   ?max=      名单上限（默认 20）
 * 响应 data: { enabled, windowMin, count, sessions: [{sessionId, items, message, channel}] }
 *
 * TODO(Phase 6): 接邮件 SaaS（SendGrid/SES）在此触发发送 + 频控；骨架期无鉴权，
 * 上生产前必须挂内部认证（与 /api/monitoring 同批处理）。
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  return observed("abandoned-carts", async () => {
    const sp = request.nextUrl.searchParams;
    const num = (key, def) => {
      const raw = sp.get(key);
      return raw !== null && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : def;
    };
    const data = await abandonedCartHook({
      windowMin: num("windowMin", 30), // 0 是合法值（立即判定），不能用 || 兜底
      max: num("max", 20),
    });
    return NextResponse.json({ code: 0, data });
  });
}
