import { NextResponse } from "next/server";
import { isAdmin, listInventory, restockMany, restockLowSizes } from "@/modules/merchant/service";
import { auditAdmin } from "@/modules/master/service";
import { observed } from "@/lib/observe";

/**
 * GET  /api/admin/inventory — 库存矩阵（商品 × 尺码）
 * POST /api/admin/inventory — {action:"restock", items:[{productId,size,qty}]}
 *                             | {action:"restock_low", productId, target?}
 * 门禁：x-admin-token（与 admin/orders 同源；补货复用 inventory 域锁语义）
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  return observed("admin-inventory", async () => {
    if (!isAdmin(request)) return NextResponse.json({ code: 401, message: "ADMIN_REQUIRED" }, { status: 401 });
    return NextResponse.json({ code: 0, data: { inventory: listInventory() } });
  });
}

export async function POST(request) {
  return observed("admin-inventory", async () => {
    if (!isAdmin(request)) return NextResponse.json({ code: 401, message: "ADMIN_REQUIRED" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    try {
      if (body.action === "restock") {
        const result = await restockMany(body.items);
        auditAdmin("inventory_restocked", `批量补货 ${result.lines} 行 / ${result.qty} 双`, request);
        return NextResponse.json({ code: 0, data: result });
      }
      if (body.action === "restock_low") {
        const result = await restockLowSizes(body.productId, Number(body.target) || 6);
        auditAdmin("inventory_restocked", `低码补齐 ${result.lines} 行 / ${result.qty} 双`, request);
        return NextResponse.json({ code: 0, data: result });
      }
      return NextResponse.json({ code: 400, message: "Unknown action" }, { status: 400 });
    } catch (err) {
      const status = err.message === "PRODUCT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ code: status, message: err.message }, { status });
    }
  });
}
