import { NextResponse } from "next/server";
import { isMaster, updateSiteSettings, auditAdmin } from "@/modules/master/service";
import { observed } from "@/lib/observe";

/**
 * POST /api/master/settings — 站点级设置（总后台）
 * {siteName?, announcement?, defaultCurrency?, defaultLang?, maintenance?}
 * 白名单校验后即时生效：公告栏 / 维护横幅 / 货币语言默认值 / 结算闸门。
 * 变更字段中文标签随响应返回（changed —— 前端提示与审计日志共用）。
 */
export const dynamic = "force-dynamic";

export async function POST(request) {
  return observed("master-settings", async () => {
    if (!isMaster(request).ok) return NextResponse.json({ code: 401, message: "MASTER_REQUIRED" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const { settings, changed } = updateSiteSettings(body);
    if (changed.length) auditAdmin("settings_updated", changed.join("、"), request);
    return NextResponse.json({ code: 0, data: { settings, changed } });
  });
}
