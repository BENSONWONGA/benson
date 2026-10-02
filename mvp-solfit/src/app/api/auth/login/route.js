import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/db";
import { login } from "@/modules/auth/service";
import { observed } from "@/lib/observe";

/**
 * POST /api/auth/login — 登录（Phase 16）
 * body: {email, password}
 * 防爆破：同邮箱连续失败 ≥5 次锁 15 分钟（锁定期间 429，不区分密码对错）
 */
export const dynamic = "force-dynamic";

export async function POST(request) {
  return observed("auth-login", async () => {
    const sessionId = getSessionId();
    const body = await request.json().catch(() => ({}));
    try {
      const user = login(sessionId, body);
      return NextResponse.json({ code: 0, data: { user } });
    } catch (err) {
      const status = err.message === "ACCOUNT_LOCKED" ? 429 : err.message === "INVALID_CREDENTIALS" ? 401 : 422;
      return NextResponse.json({ code: status, message: err.message }, { status });
    }
  });
}
