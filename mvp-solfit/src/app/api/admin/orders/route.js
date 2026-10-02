import { NextResponse } from "next/server";
import { isAdmin, listOrders, markShipped } from "@/modules/merchant/service";
import { observed } from "@/lib/observe";

/**
 * GET /api/admin/orders — 商家订单列表（?status= 筛选）
 * POST /api/admin/orders — {action: "mark_shipped", orderId, tracking?}
 * 门禁：x-admin-token（merchant 域 isAdmin；骨架期默认 dev-admin-token）
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  return observed("admin-orders", async () => {
    if (!isAdmin(request)) return NextResponse.json({ code: 401, message: "ADMIN_REQUIRED" }, { status: 401 });
    const status = new URL(request.url).searchParams.get("status") || undefined;
    return NextResponse.json({ code: 0, data: { orders: listOrders({ status }) } });
  });
}

export async function POST(request) {
  return observed("admin-orders", async () => {
    if (!isAdmin(request)) return NextResponse.json({ code: 401, message: "ADMIN_REQUIRED" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    try {
      if (body.action === "mark_shipped") {
        const order = markShipped(body.orderId, { tracking: body.tracking });
        return NextResponse.json({
          code: 0,
          data: {
            orderId: order.id, status: order.status, shippedAt: order.shippedAt, tracking: order.tracking,
          },
        });
      }
      return NextResponse.json({ code: 400, message: "Unknown action" }, { status: 400 });
    } catch (err) {
      const status = err.message === "ORDER_NOT_FOUND" ? 404 : err.message === "NOT_SHIPPABLE" ? 409 : 400;
      return NextResponse.json({ code: status, message: err.message }, { status });
    }
  });
}
