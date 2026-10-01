/**
 * /admin/baseline — Phase 1 里程碑看板：转化率与退货率基线（方案文档 §9）
 * 骨架期为内存数据；Phase 2 由数仓事件流驱动
 */

import { baselineSnapshot } from "@/lib/analytics";

export const metadata = { title: "Baseline dashboard" };
export const dynamic = "force-dynamic";

export default function BaselinePage() {
  const { funnel, rates, kpis, note } = baselineSnapshot();
  const max = Math.max(...funnel.map((f) => f.count), 1);

  return (
    <div className="container" style={{ padding: "48px 24px 96px" }}>
      <div className="eyebrow">Phase 1 milestone</div>
      <h1 style={{ fontSize: 36, marginBottom: 8 }}>Conversion &amp; return baseline</h1>
      <p className="muted" style={{ marginBottom: 32 }}>{note}</p>

      <div className="baseline-kpis">
        <div className="stat-box"><div className="num">{rates.viewToCart}%</div><div className="lbl">View → Cart</div></div>
        <div className="stat-box"><div className="num">{rates.cartToOrder}%</div><div className="lbl">Cart → Order</div></div>
        <div className="stat-box"><div className="num">{rates.checkoutToOrder}%</div><div className="lbl">Checkout → Order</div></div>
        <div className="stat-box"><div className="num">{kpis.returnRate}%</div><div className="lbl">Return rate (target &lt;12%)</div></div>
        <div className="stat-box"><div className="num">{kpis.aiCoverage}%</div><div className="lbl">AI size coverage</div></div>
        <div className="stat-box"><div className="num">{kpis.ordersTotal}</div><div className="lbl">Orders (GMV ${Math.round(kpis.gmvUsd)})</div></div>
      </div>

      <h3 style={{ margin: "36px 0 16px" }}>Funnel</h3>
      {funnel.map((f) => (
        <div key={f.step} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
            <span>{f.step}</span><b>{f.count}</b>
          </div>
          <div style={{ background: "#EFE8DC", borderRadius: 999, height: 8, overflow: "hidden" }}>
            <div style={{ width: `${(f.count / max) * 100}%`, height: "100%", background: "var(--fit)", borderRadius: 999 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
