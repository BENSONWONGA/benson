import { NextResponse } from "next/server";
import { getSessionId } from "@/lib/db";
import { listReviews, reviewSummary, createReview, reviewStatus } from "@/modules/reviews/service";
import { observed } from "@/lib/observe";

/**
 * GET  /api/reviews?productId=1 — 评价列表 + 聚合摘要 + 本会话可评状态
 * POST /api/reviews — {productId, rating(1-5), title?, body, fit?}
 *   fit ∈ too_small | true_to_size | too_large（偏码反馈 → 商品 fitStats 真实化）
 *   已购验证：NOT_PURCHASED(409)；幂等：ALREADY_REVIEWED(409)
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  return observed("reviews", async () => {
    const productId = new URL(request.url).searchParams.get("productId");
    if (!productId) return NextResponse.json({ code: 400, message: "productId required" }, { status: 400 });
    const sessionId = getSessionId();
    return NextResponse.json({
      code: 0,
      data: {
        reviews: listReviews(productId),
        summary: reviewSummary(productId),
        status: reviewStatus(sessionId, productId),
      },
    });
  });
}

export async function POST(request) {
  return observed("reviews", async () => {
    const sessionId = getSessionId();
    const body = await request.json().catch(() => ({}));
    try {
      const review = createReview(sessionId, body);
      return NextResponse.json({ code: 0, data: review });
    } catch (err) {
      const status =
        err.message === "NOT_PURCHASED" || err.message === "ALREADY_REVIEWED"
          ? 409
          : err.message === "PRODUCT_NOT_FOUND"
            ? 404
            : 422;
      return NextResponse.json({ code: status, message: err.message }, { status });
    }
  });
}
