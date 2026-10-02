import { NextResponse } from "next/server";
import { baselineSnapshot } from "@/lib/analytics";

// 读取运行时埋点数据 —— 必须禁用构建期预渲染（否则返回构建时的空快照）
export const dynamic = "force-dynamic";

/** GET /api/analytics/baseline — Phase 1 里程碑：转化率与退货率基线 */
export async function GET() {
  return NextResponse.json({ code: 0, data: baselineSnapshot() });
}
