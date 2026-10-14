import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/db";
import { currentUser } from "@/modules/auth/service";
import { observed } from "@/lib/observe";

/**
 * GET /api/auth/me — 当前会话的登录态（Phase 16）
 * data: {user: {id, email, name, createdAt, lastLoginAt} | null}
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  return observed("auth-me", async () => {
    const sessionId = getSessionId();
    return NextResponse.json({ code: 0, data: { user: currentUser(sessionId) } });
  });
}
