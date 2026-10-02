import { NextResponse } from "next/server";
import { isAdmin, merchantStats, listOrders } from "@/modules/merchant/service";
import { allProducts } from "@/modules/catalog/service";
import { getStock } from "@/modules/inventory/service";
import { store } from "@/lib/db";
import { observed } from "@/lib/observe";

/**
 * GET /api/admin/dashboard — 仪表盘聚合（商家后台首页）
 * { kpis, trend(14日 GMV/订单), statusBreakdown, topProducts, lowStock, recentOrders }
 * 门禁：x-admin-token（merchant 域 isAdmin）。
 */
export const dynamic = "force-dynamic";

const isSettled = (o) => o.status !== "pending_payment" && o.status !== "payment_failed";

export async function GET(request) {
  return observed("admin-dashboard", async () => {
    if (!isAdmin(request)) return NextResponse.json({ code: 401, message: "ADMIN_REQUIRED" }, { status: 401 });

    const orders = [...store("orders").values()];
    const settled = orders.filter(isSettled);

    // 14 日趋势：按天下钻 GMV 与单量（含今天）
    const days = [];
    const dayKey = (d) => d.toISOString().slice(0, 10);
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      days.push(dayKey(d));
    }
    const trend = days.map((day) => {
      const dayOrders = settled.filter((o) => (o.createdAt || "").slice(0, 10) === day);
      return {
        day,
        label: day.slice(5).replace("-", "/"),
        orders: dayOrders.length,
        gmv: Math.round(dayOrders.reduce((s, o) => s + (o.totals?.total || 0), 0) * 100) / 100,
      };
    });

    // 状态分布（全量订单按状态计数）
    const statusMap = new Map();
    for (const o of orders) statusMap.set(o.status, (statusMap.get(o.status) || 0) + 1);
    const statusBreakdown = [...statusMap.entries()].map(([status, count]) => ({ status, count }));

    // 热销商品：已成交订单的行项目聚合（按销量，营收并列展示 —— lineTotal 为行小计）
    const units = new Map();
    for (const o of settled) {
      for (const it of o.items || []) {
        const id = Number(it.productId);
        if (!id) continue;
        const cur = units.get(id) || { units: 0, revenue: 0 };
        cur.units += it.qty || 0;
        cur.revenue += it.lineTotal ?? (it.unitPrice || 0) * (it.qty || 0);
        units.set(id, cur);
      }
    }
    const priceOf = new Map(allProducts().map((p) => [p.id, p]));
    const topProducts = [...units.entries()]
      .map(([id, v]) => {
        const p = priceOf.get(id);
        return { id, name: p?.name || `商品 #${id}`, units: v.units, revenue: Math.round(v.revenue * 100) / 100 };
      })
      .sort((a, b) => b.units - a.units)
      .slice(0, 6);

    // 缺码预警：OOS 尺码最多的前 5 个商品
    const lowStock = allProducts()
      .map((p) => {
        const stocks = p.sizes.map((s) => getStock(p.id, s));
        return {
          id: p.id, name: p.name,
          oos: stocks.filter((x) => x === 0).length,
          total: stocks.reduce((s, x) => s + x, 0),
        };
      })
      .filter((x) => x.oos > 0)
      .sort((a, b) => b.oos - a.oos)
      .slice(0, 5);

    return NextResponse.json({
      code: 0,
      data: {
        kpis: merchantStats(),
        trend,
        statusBreakdown,
        topProducts,
        lowStock,
        recentOrders: listOrders({ limit: 6 }),
        generatedAt: new Date().toISOString(),
      },
    });
  });
}
