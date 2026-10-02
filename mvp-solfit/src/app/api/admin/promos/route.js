import { NextResponse } from "next/server";
import { isAdmin } from "@/modules/merchant/service";
import { adminListPromos, adminCreatePromo, adminSetPromoActive } from "@/modules/loyalty/service";
import { observed } from "@/lib/observe";

/**
 * GET  /api/admin/promos — 优惠码列表（商家视图）
 * POST /api/admin/promos — {action:"create", code, type:"percent"|"fixed", value, minSpend?, maxUses?, expiresAt?}
 *                         | {action:"activate"|"deactivate", code}
 * 门禁：x-admin-token（merchant 域 isAdmin）。
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  return observed("admin-promos", async () => {
    if (!isAdmin(request)) return NextResponse.json({ code: 401, message: "ADMIN_REQUIRED" }, { status: 401 });
    return NextResponse.json({ code: 0, data: { promos: adminListPromos() } });
  });
}

export async function POST(request) {
  return observed("admin-promos", async () => {
    if (!isAdmin(request)) return NextResponse.json({ code: 401, message: "ADMIN_REQUIRED" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    try {
      if (body.action === "create") {
        const promo = adminCreatePromo(body);
        return NextResponse.json({ code: 0, data: { promo } });
      }
      if (body.action === "activate" || body.action === "deactivate") {
        const promo = adminSetPromoActive(body.code, body.action === "activate");
        return NextResponse.json({ code: 0, data: { promo } });
      }
      return NextResponse.json({ code: 400, message: "Unknown action" }, { status: 400 });
    } catch (err) {
      const status = err.message === "PROMO_EXISTS" ? 409 : 400;
      return NextResponse.json({ code: status, message: err.message }, { status });
    }
  });
}
