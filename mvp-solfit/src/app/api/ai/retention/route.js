import { NextResponse } from "next/server";
import { buildRetentionDigests, dispatchRetentionDigests } from "@/ai/retention";
import { observed } from "@/lib/observe";

/**
 * GET  /api/ai/retention — 留存摘要预览（Phase 7）
 *   ?tier=vip|active|at_risk|lapsed  只看某层
 *   ?max=20                          名单上限
 *   响应含 RFM 分层分布、场景命中、每客场景与候选（不发邮件）
 * POST /api/ai/retention — 触发一轮投递（频控三闸 + Provider + 审计）
 *   body: {tier?, max?}
 *
 * TODO(上生产): 内部运营端点必须挂内部认证（与 /api/monitoring 同批）。
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  return observed("ai-retention", async () => {
    const sp = request.nextUrl.searchParams;
    const tier = ["vip", "active", "at_risk", "lapsed"].includes(sp.get("tier")) ? sp.get("tier") : undefined;
    const raw = sp.get("max");
    const max = raw !== null && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : 20;
    const data = await buildRetentionDigests({ tier, max });
    return NextResponse.json({ code: 0, data });
  });
}

export async function POST(request) {
  return observed("ai-retention", async () => {
    const body = await request.json().catch(() => ({}));
    const tier = ["vip", "active", "at_risk", "lapsed"].includes(body?.tier) ? body.tier : undefined;
    const num = (key, def) => {
      const v = body?.[key];
      return v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : def;
    };
    const data = await dispatchRetentionDigests({ tier, max: num("max", 20) });
    return NextResponse.json({ code: 0, data });
  });
}
