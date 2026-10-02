import { NextResponse } from "next/server";
import { isAdmin, merchantStats, listOrders, listInventory } from "@/modules/merchant/service";
import { observed } from "@/lib/observe";

/**
 * GET /api/admin/overview — 商家后台一站式数据源（10s 轮询端点）
 * { stats, orders, inventory }：经营速览 + 全量订单摘要 + 库存矩阵。
 * 门禁：x-admin-token（merchant 域 isAdmin）。
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  return observed("admin-overview", async () => {
    if (!isAdmin(request)) return NextResponse.json({ code: 401, message: "ADMIN_REQUIRED" }, { status: 401 });
    return NextResponse.json({
      code: 0,
      data: {
        stats: merchantStats(),
        orders: listOrders(),
        inventory: listInventory(),
      },
    });
  });
}
