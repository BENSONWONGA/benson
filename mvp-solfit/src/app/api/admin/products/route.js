import { NextResponse } from "next/server";
import { isAdmin, adminListProducts, adminCreateProduct, adminUpdateProduct, adminSetListed } from "@/modules/merchant/service";
import { observed } from "@/lib/observe";

/**
 * GET  /api/admin/products — 商家商品视图（含下架 + 库存汇总）
 * POST /api/admin/products — {action:"create", ...商品字段}
 *                             | {action:"update", id, patch:{...白名单字段}}
 *                             | {action:"list"|"unlist", id}
 * 门禁：x-admin-token（merchant 域）。CRUD 本体在 catalog 域，
 * 本路由只做编排转发（库存初始化与向量重刷见 merchant service）。
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  return observed("admin-products", async () => {
    if (!isAdmin(request)) return NextResponse.json({ code: 401, message: "ADMIN_REQUIRED" }, { status: 401 });
    return NextResponse.json({ code: 0, data: { products: adminListProducts() } });
  });
}

export async function POST(request) {
  return observed("admin-products", async () => {
    if (!isAdmin(request)) return NextResponse.json({ code: 401, message: "ADMIN_REQUIRED" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    try {
      if (body.action === "create") {
        const product = await adminCreateProduct(body);
        return NextResponse.json({ code: 0, data: { product } });
      }
      if (body.action === "update") {
        const product = adminUpdateProduct(body.id, body.patch || {});
        return NextResponse.json({ code: 0, data: { product } });
      }
      if (body.action === "list" || body.action === "unlist") {
        const product = adminSetListed(body.id, body.action === "list");
        return NextResponse.json({ code: 0, data: { product } });
      }
      return NextResponse.json({ code: 400, message: "Unknown action" }, { status: 400 });
    } catch (err) {
      const status = err.message === "PRODUCT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ code: status, message: err.message }, { status });
    }
  });
}
