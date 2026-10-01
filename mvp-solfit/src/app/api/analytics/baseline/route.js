import { NextResponse } from "next/server";
import { baselineSnapshot } from "@/lib/analytics";

/** GET /api/analytics/baseline — Phase 1 里程碑：转化率与退货率基线 */
export async function GET() {
  return NextResponse.json({ code: 0, data: baselineSnapshot() });
}
