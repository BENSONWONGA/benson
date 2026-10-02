import { NextResponse } from "next/server";
import { isAdmin } from "@/modules/merchant/service";
import { adminRemoveReview } from "@/modules/reviews/service";
import { observed } from "@/lib/observe";

/**
 * POST /api/admin/reviews — 评价审核
 *   {action:"remove", reviewId} — 删除违规评价（聚合回写刷新商品评分）
 * 门禁：x-admin-token（merchant 域 isAdmin）。列表经 /api/admin/overview 下发。
 */
export const dynamic = "force-dynamic";

export async function POST(request) {
  return observed("admin-reviews", async () => {
    if (!isAdmin(request)) return NextResponse.json({ code: 401, message: "ADMIN_REQUIRED" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    try {
      if (body.action === "remove") {
        const removed = adminRemoveReview(body.reviewId);
        return NextResponse.json({ code: 0, data: { removed: removed.id } });
      }
      return NextResponse.json({ code: 400, message: "Unknown action" }, { status: 400 });
    } catch (err) {
      const status = err.message === "REVIEW_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ code: status, message: err.message }, { status });
    }
  });
}
