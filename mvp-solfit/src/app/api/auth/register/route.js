import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/db";
import { register } from "@/modules/auth/service";
import { observed } from "@/lib/observe";

/**
 * POST /api/auth/register — 注册（Phase 16）
 * body: {email, password, name?}
 * 注册即登录：当前会话绑定账户 + 游客数据迁移（购物车合并/反馈水合/订单认领）
 */
export const dynamic = "force-dynamic";

export async function POST(request) {
  return observed("auth-register", async () => {
    const sessionId = getSessionId();
    const body = await request.json().catch(() => ({}));
    try {
      const user = register(sessionId, body);
      return NextResponse.json({ code: 0, data: { user } });
    } catch (err) {
      const status = err.message === "USER_EXISTS" ? 409 : 422;
      return NextResponse.json({ code: status, message: err.message }, { status });
    }
  });
}
