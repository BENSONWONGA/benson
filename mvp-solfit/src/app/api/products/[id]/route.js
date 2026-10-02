import { NextResponse } from "next/server";
import { getProduct } from "@/modules/catalog/service";
import { trackEvent } from "@/lib/db";

/** GET /api/products/:id */
export async function GET(_req, { params }) {
  const product = await getProduct(params.id);
  if (!product) return NextResponse.json({ code: 404, message: "not found" }, { status: 404 });
  trackEvent("product_api_fetched", { productId: product.id });
  return NextResponse.json({ code: 0, data: product });
}
