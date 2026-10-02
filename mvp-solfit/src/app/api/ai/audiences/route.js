import { NextResponse } from "next/server";
import { audiencesPreview, exportAudience } from "@/ai/audiences";
import { observed } from "@/lib/observe";

/**
 * GET /api/ai/audiences — 人群预览（Phase 8，运营侧）
 *   ?maxEntries=10   每个人群的样例条数
 *   响应：五类人群规模 + 脱敏样例（邮箱 m***@domain）
 *
 * POST /api/ai/audiences — 导出（body: {segmentId, platform: "meta"|"google"|"json", top?}）
 *   platform=meta/google → {csv}（SHA-256 哈希邮箱，平台 Custom Audience 规范）
 *   platform=json       → {payload}（含 DPA 商品清单与种子价值分）
 *   top 仅对 lookalike_seed 有效（按 LTV 代理分截断种子规模）
 *
 * TODO(上生产): 内部运营端点必须挂内部认证（与 /api/monitoring 同批）；
 *   平台直连（Marketing API 服务端上传）在 Phase 9+ 接入，本路由先出标准格式。
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  return observed("ai-audiences", async () => {
    const sp = request.nextUrl.searchParams;
    const raw = sp.get("maxEntries");
    const maxEntries = raw !== null && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : 10;
    const data = audiencesPreview({ maxEntries });
    return NextResponse.json({ code: 0, data });
  });
}

export async function POST(request) {
  return observed("ai-audiences", async () => {
    const body = await request.json().catch(() => ({}));
    const segmentId = typeof body?.segmentId === "string" ? body.segmentId : null;
    const platform = ["meta", "google", "json"].includes(body?.platform) ? body.platform : "json";
    if (!segmentId) {
      return NextResponse.json({ code: 400, message: "segmentId required" }, { status: 400 });
    }
    const top = Number.isFinite(Number(body?.top)) && Number(body?.top) > 0 ? Number(body.top) : undefined;
    const data = exportAudience({ segmentId, platform, top });
    if (data.error) {
      const status = data.error === "SEGMENT_NOT_FOUND" ? 404 : 422;
      return NextResponse.json({ code: status, message: data.error }, { status });
    }
    return NextResponse.json({ code: 0, data });
  });
}
