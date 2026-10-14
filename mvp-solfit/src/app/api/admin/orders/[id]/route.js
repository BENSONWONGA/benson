import { NextResponse } from "next/server";
import { isAdmin } from "@/modules/merchant/service";
import { store } from "@/lib/db";
import { observed } from "@/lib/observe";

/**
 * GET /api/admin/orders/[id] — 订单详情（完整字段：行项目/地址/金额拆解/物流/时间线）
 * 商家后台订单管理页"详情"弹窗取数。门禁：x-admin-token。
 */
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  return observed("admin-order-detail", async () => {
    if (!isAdmin(request)) return NextResponse.json({ code: 401, message: "ADMIN_REQUIRED" }, { status: 401 });
    const order = store("orders").get(params.id);
    if (!order) return NextResponse.json({ code: 404, message: "ORDER_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ code: 0, data: { order } });
  });
}
