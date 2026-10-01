import { NextResponse } from "next/server";
import { coldStartRecommend } from "@/ai/recommender";

/** GET /api/ai/recommendations?context=&excludeId= — 冷启动推荐（Phase 2 升级为召回+排序） */
export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const products = coldStartRecommend({
    excludeId: sp.get("excludeId"),
    context: {
      preferCategory: sp.get("preferCategory") || undefined,
      preferWidth: sp.get("preferWidth") || undefined,
    },
  });
  return NextResponse.json({ code: 0, data: products });
}
