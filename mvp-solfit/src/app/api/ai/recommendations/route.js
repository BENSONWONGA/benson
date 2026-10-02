import { NextResponse } from "next/server";
import { recommend } from "@/ai/recommender";
import { getSessionId } from "@/lib/db";

/**
 * GET /api/ai/recommendations — 个性化推荐（Phase 3）
 *   ?seedId=     种子商品（PDP 相关推荐）
 *   ?excludeId=  排除商品
 *   ?max=        数量（默认 4）
 *
 * 降级链：personalized（CF+合脚档案）→ seed_content（结构相似）→ cold_start（rating）
 * 响应 data: [{...product, recScore, recReasons[]}] —— recReasons 为可解释推荐依据
 */
export async function GET(request) {
  const sessionId = getSessionId(); // route handler 内可安全创建会话
  const sp = request.nextUrl.searchParams;
  const products = await recommend({
    sessionId,
    seedProductId: sp.get("seedId") || undefined,
    excludeId: sp.get("excludeId") || undefined,
    max: Number(sp.get("max")) || 4,
  });
  return NextResponse.json({ code: 0, data: products });
}
