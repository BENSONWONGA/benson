import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/db";
import { subscribe, getSubscription } from "@/modules/notification/service";
import { observed } from "@/lib/observe";

/**
 * POST /api/notifications/subscribe — 营销订阅（Phase 6，body: {email}）
 * 显式同意是营销发送的唯一合规前提（GDPR/CCPA，方案文档 §7.4）；
 * body {email: null} 或 DELETE = 退订（one-click unsubscribe 语义）。
 */
export const dynamic = "force-dynamic";

export async function POST(request) {
  return observed("subscribe", async () => {
    const sessionId = getSessionId();
    const body = await request.json().catch(() => null);
    try {
      const data = subscribe(sessionId, body?.email ?? null);
      return NextResponse.json({ code: 0, data });
    } catch (err) {
      return NextResponse.json({ code: 400, message: err.message }, { status: 400 });
    }
  });
}

export async function DELETE(request) {
  return observed("subscribe", async () => {
    const sessionId = getSessionId();
    return NextResponse.json({ code: 0, data: subscribe(sessionId, null) });
  });
}

/** GET — 当前会话订阅状态（邮箱脱敏展示） */
export async function GET(request) {
  return observed("subscribe", async () => {
    const sessionId = getSessionId();
    return NextResponse.json({ code: 0, data: getSubscription(sessionId) });
  });
}
