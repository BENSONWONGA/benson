import { NextResponse } from "next/server";
import { isMaster, listStaff, listAuditLogs, masterHealth } from "@/modules/master/service";
import { getSiteSettings } from "@/lib/site-settings";
import { merchantStats } from "@/modules/merchant/service";
import { observed } from "@/lib/observe";

/**
 * GET /api/master/overview — 总后台一站式数据源（10s 轮询端点）
 * { staff, settings, auditLogs, health, stats }。
 * 门禁：x-master-token（master 域 isMaster —— 超管令牌或 owner 签发令牌）。
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  return observed("master-overview", async () => {
    if (!isMaster(request).ok) return NextResponse.json({ code: 401, message: "MASTER_REQUIRED" }, { status: 401 });
    return NextResponse.json({
      code: 0,
      data: {
        staff: listStaff(),
        settings: getSiteSettings(),
        auditLogs: listAuditLogs(120),
        health: masterHealth(),
        stats: merchantStats(),
      },
    });
  });
}
