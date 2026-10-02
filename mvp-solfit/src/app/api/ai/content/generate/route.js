import { NextResponse } from "next/server";
import { isAdmin } from "@/modules/merchant/service";
import { generateSeoPost, generateProductCopy } from "@/ai/content";
import { observed } from "@/lib/observe";

/**
 * POST /api/ai/content/generate — AIGC 内容流水线（草稿生成，人审前置）
 *   {mode:"seo_post", topic, productId?} — SEO 博客文章草稿（长尾词入口）
 *   {mode:"product_copy", productId, locale?} — 商品详情页文案
 * 返回草稿（source: "llm" | "template"）—— 只进商家编辑表单，不直接发布。
 * 门禁：x-admin-token（AIGC 是商家工具；前台拿不到）。
 */
export const dynamic = "force-dynamic";

export async function POST(request) {
  return observed("ai-content-generate", async () => {
    if (!isAdmin(request)) return NextResponse.json({ code: 401, message: "ADMIN_REQUIRED" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    try {
      if (body.mode === "seo_post") {
        const draft = await generateSeoPost({ topic: body.topic, productId: body.productId });
        return NextResponse.json({ code: 0, data: draft });
      }
      if (body.mode === "product_copy") {
        const draft = await generateProductCopy(body.productId, body.locale);
        return NextResponse.json({ code: 0, data: draft });
      }
      return NextResponse.json({ code: 400, message: "Unknown mode" }, { status: 400 });
    } catch (err) {
      const status = ["TOPIC_REQUIRED", "PRODUCT_NOT_FOUND"].includes(err.message) ? 422 : 500;
      return NextResponse.json({ code: status, message: err.message }, { status });
    }
  });
}
