import { NextResponse } from "next/server";
import { isAdmin } from "@/modules/merchant/service";
import { auditAdmin } from "@/modules/master/service";
import { updateBrandingSettings, updateSeoSettings } from "@/lib/site-settings";
import { observed } from "@/lib/observe";

/**
 * POST /api/admin/settings — 品牌与 SEO（商家后台 Phase 23）
 *   {action:"theme", theme?, themeLocked?}                     —— 站点默认主题 / 全站锁定
 *   {action:"homepage", homeContent?, homeHeroImage?}          —— 首页装修（两语言文案 + 主图）
 *   {action:"seo", title?, description?, keywords?}            —— 首页 meta
 * 前台即时生效（首页 SSR 每请求读设置）；门禁：x-admin-token（merchant 域）。
 * 均记审计（总后台"审计日志"可查"谁改了主题/首页/SEO"）。
 */
export const dynamic = "force-dynamic";

export async function POST(request) {
  return observed("admin-settings", async () => {
    if (!isAdmin(request)) return NextResponse.json({ code: 401, message: "ADMIN_REQUIRED" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    try {
      let result;
      if (body.action === "theme") {
        result = updateBrandingSettings({ theme: body.theme, themeLocked: body.themeLocked });
      } else if (body.action === "homepage") {
        result = updateBrandingSettings({ homeContent: body.homeContent, homeHeroImage: body.homeHeroImage });
      } else if (body.action === "seo") {
        result = updateSeoSettings(body);
      } else {
        return NextResponse.json({ code: 400, message: "Unknown action" }, { status: 400 });
      }
      if (result.changed.length) auditAdmin(`branding_${body.action}`, result.changed.join("、"), request);
      return NextResponse.json({ code: 0, data: result });
    } catch (err) {
      return NextResponse.json({ code: 400, message: err.message }, { status: 400 });
    }
  });
}
