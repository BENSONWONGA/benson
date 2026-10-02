import { NextResponse } from "next/server";
import { isAdmin } from "@/modules/merchant/service";
import { adminAdjustPoints } from "@/modules/loyalty/service";
import { auditAdmin } from "@/modules/master/service";
import { observed } from "@/lib/observe";

/**
 * POST /api/admin/customers — 会员运营
 *   {action:"adjust_points", userId, delta, reason?} — 手动调积分（补偿/奖励/扣罚）
 * 门禁：x-admin-token（merchant 域 isAdmin）。名册经 /api/admin/overview 下发。
 */
export const dynamic = "force-dynamic";

export async function POST(request) {
  return observed("admin-customers", async () => {
    if (!isAdmin(request)) return NextResponse.json({ code: 401, message: "ADMIN_REQUIRED" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    try {
      if (body.action === "adjust_points") {
        const result = adminAdjustPoints(body.userId, body.delta, body.reason);
        auditAdmin("points_adjusted", `会员 ${body.userId} 积分 ${body.delta > 0 ? "+" : ""}${body.delta}（${body.reason || "手动调整"}）`, request);
        return NextResponse.json({ code: 0, data: result });
      }
      return NextResponse.json({ code: 400, message: "Unknown action" }, { status: 400 });
    } catch (err) {
      const status = err.message === "USER_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ code: status, message: err.message }, { status });
    }
  });
}
