/**
 * /admin/baseline — Phase 1 里程碑看板：转化率与退货率基线（方案文档 §9）
 * 骨架期为内存数据；Phase 2 由数仓事件流驱动
 * 视觉：AdminFrame 液态玻璃框架（与商家后台同一套 .adm-* 皮肤）。
 */

import "../admin.css";
import AdminFrame from "@/components/admin/AdminFrame";
import { baselineSnapshot } from "@/lib/analytics";

export const metadata = { title: "基线看板" };
export const dynamic = "force-dynamic";

export default function BaselinePage() {
  const { funnel, rates, kpis, note } = baselineSnapshot();
  const max = Math.max(...funnel.map((f) => f.count), 1);

  return (
    <AdminFrame eyebrow="Phase 1 里程碑" title="转化率与退货率基线" subtitle={note}>
      <div className="adm-kpis">
        <div className="adm-kpi"><div className="adm-kpi-num">{rates.viewToCart}%</div><div className="adm-kpi-lbl">浏览 → 加购</div></div>
        <div className="adm-kpi"><div className="adm-kpi-num">{rates.cartToOrder}%</div><div className="adm-kpi-lbl">加购 → 下单</div></div>
        <div className="adm-kpi"><div className="adm-kpi-num">{rates.checkoutToOrder}%</div><div className="adm-kpi-lbl">结算 → 下单</div></div>
        <div className={`adm-kpi${kpis.returnRate > 12 ? " err" : " ok"}`}>
          <div className="adm-kpi-num">{kpis.returnRate}%</div>
          <div className="adm-kpi-lbl">退货率（目标 &lt;12%）</div>
        </div>
        <div className="adm-kpi"><div className="adm-kpi-num">{kpis.aiCoverage}%</div><div className="adm-kpi-lbl">AI 尺码推荐覆盖率</div></div>
        <div className="adm-kpi">
          <div className="adm-kpi-num">{kpis.ordersTotal}</div>
          <div className="adm-kpi-lbl">订单数</div>
          <div className="adm-kpi-sub">GMV ${Math.round(kpis.gmvUsd)}</div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-card-title">转化漏斗</div>
        {funnel.map((f) => (
          <div key={f.step} style={{ marginBottom: 12 }}>
            <div className="adm-row" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{f.step}</span>
              <span className="adm-spacer adm-muted" style={{ fontSize: 12, fontWeight: 700 }}>{f.count}</span>
            </div>
            <div className="adm-hbar"><div style={{ width: `${(f.count / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </AdminFrame>
  );
}
