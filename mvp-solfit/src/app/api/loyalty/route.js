import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/db";
import { loyaltyStatus } from "@/modules/loyalty/service";
import { observed } from "@/lib/observe";

/**
 * GET /api/loyalty — 当前会话的会员状态（Phase 19）
 * {loggedIn, points, lifetimeSpend, tier:{id,name,multiplier}, pointsValue, nextTier}
 * 游客返回 loggedIn:false —— 结算页据此引导注册（注册即攒分是获客钩子）。
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  return observed("loyalty", async () => {
    return NextResponse.json({ code: 0, data: loyaltyStatus(getSessionId()) });
  });
}
