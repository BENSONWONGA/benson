import { NextResponse } from "next/server";
import { scanFoot } from "@/ai/footscan";
import { recommendSizeForProduct } from "@/ai/size-engine";
import { getFitProfile, saveFitProfile } from "@/modules/customer/service";
import { getSessionId } from "@/lib/db";
import { observed } from "@/lib/observe";

/**
 * POST /api/ai/foot-scan — 拍照量脚（V2 骨架；FormData）
 *   photo: File（不落库 —— 照片不进管道/存储，GDPR 敏感数据即焚）
 *   referenceMm?: 参照物长边（默认信用卡 85.6）
 *   manualLengthCm?/manualWidthCm?: 卷尺实测值（优先于照片伪测量）
 *   productId?: 落楦型校验（finalSize/exactMatch）并沉淀脚型档案
 * resp: {code, data:{size,width,confidence,measurements,source,model,reason,finalSize?,productAdjustment?}}
 */
export const dynamic = "force-dynamic";

export async function POST(request) {
  return observed("ai-foot-scan", async () => {
    const sessionId = getSessionId();
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ code: 400, message: "FORMDATA_REQUIRED" }, { status: 400 });

    const photoFile = form.get("photo");
    let photo = null;
    if (photoFile && typeof photoFile === "object" && photoFile.size > 0) {
      if (photoFile.size > 12 * 1024 * 1024) return NextResponse.json({ code: 413, message: "PHOTO_TOO_LARGE" }, { status: 413 });
      photo = Buffer.from(await photoFile.arrayBuffer()); // 只过流不落库
    }

    const referenceMm = Number(form.get("referenceMm")) || undefined;
    const manualLengthCm = Number(form.get("manualLengthCm")) || undefined;
    const manualWidthCm = Number(form.get("manualWidthCm")) || undefined;
    const productId = form.get("productId");

    try {
      const scan = scanFoot({ photo, referenceMm, manualLengthCm, manualWidthCm });

      // 商品级楦型校验：测量尺码作 usualSize 输入（Standard 口径避免宽度二次修正），
      // 测量事实（size/width/measurements）覆盖问卷规则的对应字段。
      let rec = scan;
      if (productId) {
        const productRec = await recommendSizeForProduct(
          { usualSize: scan.size, usualBrand: "Other", widthFeel: "Standard", footNotes: [] },
          productId,
        );
        rec = { ...productRec, ...scan };
      }

      // 档案沉淀 —— PDP 进站预选与 AI 导购上下文共用（来源标记便于后续模型训练过滤）
      saveFitProfile(sessionId, {
        ...getFitProfile(sessionId),
        source: "foot_scan",
        productId: productId || null,
        measurements: scan.measurements,
        recommendation: rec,
      });

      return NextResponse.json({ code: 0, data: rec });
    } catch (err) {
      const status = ["PHOTO_REQUIRED", "UNSUPPORTED_IMAGE"].includes(err.message) ? 422 : 400;
      return NextResponse.json({ code: status, message: err.message }, { status });
    }
  });
}
