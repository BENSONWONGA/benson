import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/db";
import { logout } from "@/modules/auth/service";
import { observed } from "@/lib/observe";

/**
 * POST /api/auth/logout — 退出登录（Phase 16）
 * 解除会话绑定；会话内已合并的数据（购物车/反馈）留在会话。
 */
export const dynamic = "force-dynamic";

export async function POST(request) {
  return observed("auth-logout", async () => {
    const sessionId = getSessionId();
    return NextResponse.json({ code: 0, data: logout(sessionId) });
  });
}
