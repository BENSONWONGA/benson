import { NextResponse } from "next/server";
import { isAdmin, merchantStats, listOrders, listInventory, adminListProducts } from "@/modules/merchant/service";
import { adminListPromos, adminListCustomers } from "@/modules/loyalty/service";
import { adminListPosts } from "@/modules/content/service";
import { adminListReviews } from "@/modules/reviews/service";
import { getSiteSettings } from "@/lib/site-settings";
import { observed } from "@/lib/observe";

/**
 * GET /api/admin/overview — 商家后台一站式数据源（10s 轮询端点）
 * { stats, orders, inventory, products, promos, posts, reviews, customers, settings }。
 * settings：主题/首页装修/SEO（Phase 23 三个标签的表单初值来源）。
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
        products: adminListProducts(),
        promos: adminListPromos(),
        posts: adminListPosts(),
        reviews: adminListReviews(),
        customers: adminListCustomers(),
        settings: getSiteSettings(),
      },
    });
  });
}
