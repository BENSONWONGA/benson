import { NextResponse } from "next/server";
import { recommendSize, recommendSizeForProduct } from "@/ai/size-engine";
import { getFitProfile, saveFitProfile } from "@/modules/customer/service";
import { getSessionId } from "@/lib/db";
import { observed } from "@/lib/observe";

/** GET /api/ai/size-recommendation — 回读本会话已保存的脚型档案（PDP 进站预选） */
export async function GET(request) {
  return observed("size-recommendation", async () => {
    const sessionId = getSessionId();
    const profile = getFitProfile(sessionId);
    return NextResponse.json({ code: 0, data: profile }); // 无档案 => null
  });
}

/**
 * POST /api/ai/size-recommendation
 * body: {usualSize, usualBrand, widthFeel, footNotes[], productId?}
 * resp: {code, data: {size, width, confidence, measurements, reason, finalSize?, exactMatch?}}
 * productId 存在时落楦型校验（recommendSizeForProduct），并保存为脚型档案
 */
export async function POST(request) {
  return observed("size-recommendation", async () => {
    const sessionId = getSessionId();
    const body = await request.json().catch(() => null);
    if (!body?.usualSize || !body?.usualBrand || !body?.widthFeel) {
      return NextResponse.json({ code: 400, message: "usualSize / usualBrand / widthFeel are required" }, { status: 400 });
    }
    try {
      const rec = body.productId
        ? await recommendSizeForProduct(body, body.productId)
        : recommendSize(body);
      // 档案沉淀 —— 用户下次进站直接预选（Phase 3 迁移账户级 + GDPR 分区）
      saveFitProfile(sessionId, { ...body, recommendation: rec });
      return NextResponse.json({ code: 0, data: rec });
    } catch (err) {
      return NextResponse.json({ code: 422, message: err.message }, { status: 422 });
    }
  });
}
