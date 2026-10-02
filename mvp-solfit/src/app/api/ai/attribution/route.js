import { NextResponse } from "next/server";
import { attributeRevenue } from "@/ai/recommender/attribution";
import { variantLift } from "@/ai/recommender/model";
import { observed } from "@/lib/observe";

/**
 * GET /api/ai/attribution — 推荐归因报告（Phase 11，给业务的"钱数答卷"）
 *
 * 两个口径一起给，读数须知：
 *   attributed  = 推荐在场的收入（last-touch 印象 join）—— 渗透率，会高估增量
 *   rec.lift    = 个性化臂 vs control 对照臂的转化率差 —— 真实增量的近似
 * 报告不含任何 PII（收入与计数级聚合）。
 *
 * TODO(上生产): 内部运营端点必须挂内部认证（与 /api/monitoring 同批）。
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  return observed("ai-attribution", async () => {
    return NextResponse.json({
      code: 0,
      data: { ...attributeRevenue(), lift: variantLift() },
    });
  });
}
