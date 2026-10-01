import { NextResponse } from "next/server";
import { listProducts } from "@/modules/catalog/service";
import { trackEvent } from "@/lib/db";

/** GET /api/products?category=&width=&heel=&sort= */
export async function GET(request) {
  const sp = request.nextUrl.searchParams;
  const data = listProducts({
    category: sp.get("category") || "All",
    width: sp.get("width") || "All",
    heel: sp.get("heel") || "All",
    sort: sp.get("sort") || "featured",
  });
  trackEvent("catalog.list_viewed", { query: Object.fromEntries(sp) });
  return NextResponse.json({ code: 0, data, total: data.length });
}
