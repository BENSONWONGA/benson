import { NextResponse } from "next/server";
import { isAdmin, adminListProducts, adminCreateProduct, adminUpdateProduct, adminSetListed } from "@/modules/merchant/service";
import { auditAdmin } from "@/modules/master/service";
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
        auditAdmin("product_created", `「${product.name}」$${product.price}（每码初始库存 6）`, request);
        return NextResponse.json({ code: 0, data: { product } });
      }
      if (body.action === "update") {
        const product = adminUpdateProduct(body.id, body.patch || {});
        auditAdmin("product_updated", `#${product.id}「${product.name}」`, request);
        return NextResponse.json({ code: 0, data: { product } });
      }
      if (body.action === "list" || body.action === "unlist") {
        const product = adminSetListed(body.id, body.action === "list");
        auditAdmin(body.action === "list" ? "product_listed" : "product_unlisted", `#${product.id}「${product.name}」`, request);
        return NextResponse.json({ code: 0, data: { product } });
      }
      return NextResponse.json({ code: 400, message: "Unknown action" }, { status: 400 });
    } catch (err) {
      const status = err.message === "PRODUCT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ code: status, message: err.message }, { status });
    }
  });
}
