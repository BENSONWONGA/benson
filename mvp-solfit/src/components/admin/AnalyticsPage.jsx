/**
 * components/admin/AnalyticsPage — 数据分析
 * 聚合三源：转化基线（/api/analytics/baseline）+ 监控总览（/api/monitoring/overview）
 * + 经营聚合（/api/admin/dashboard）：漏斗 / KPI / 告警 / RED / RUM 一页看全。
 */
"use client";

import { useEffect, useState } from "react";
import { useAdmin, Card, Badge, Empty, usd, Kpi } from "@/components/admin/ui";

export default function AnalyticsPage() {
  const { token } = useAdmin();
  const [baseline, setBaseline] = useState(null);
  const [monitor, setMonitor] = useState(null);
  const [dash, setDash] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [b, m, d] = await Promise.all([
          fetch("/api/analytics/baseline", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/monitoring/overview?force=1", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/admin/dashboard", { headers: { "x-admin-token": token }, cache: "no-store" }).then((r) => r.json()),
        ]);
        if (b.code === 0) setBaseline(b.data);
        if (m.code === 0) setMonitor(m.data);
        if (d.code === 0) setDash(d.data);
      } catch (e) {
        setErr(e.message);
      }
    })();
  }, [token]);

  if (err) return <Card title="数据分析"><Empty>加载失败：{err}</Empty></Card>;
  if (!baseline || !monitor || !dash) return <Card title="数据分析"><Empty>加载中…</Empty></Card>;

  const maxFunnel = Math.max(...baseline.funnel.map((f) => f.count), 1);

  return (
    <>
      {/* ===== 核心 KPI ===== */}
      <div className="adm-kpis">
        <Kpi num={usd(dash.kpis.gmvUsd)} lbl="GMV (USD)" sub={`毛利 ${usd(dash.kpis.marginUsd)} · ${dash.kpis.marginPct}%`} />
        <Kpi num={`${baseline.rates.viewToCart}%`} lbl="浏览 → 加购" sub={`加购 → 下单 ${baseline.rates.cartToOrder}%`} />
        <Kpi num={`${baseline.rates.checkoutToOrder}%`} lbl="结算 → 下单" />
        <Kpi num={`${baseline.kpis.returnRate}%`} lbl="退货率" tone={baseline.kpis.returnRate > 12 ? "err" : "ok"} sub="AI 目标 <12%" />
        <Kpi num={`${baseline.kpis.aiCoverage}%`} lbl="AI 尺码推荐覆盖" tone={baseline.kpis.aiCoverage < 60 ? "warn" : "ok"} sub="Phase 2 里程碑 >60%" />
        <Kpi num={baseline.kpis.ordersTotal} lbl="订单数" sub={`口径：${baseline.note ? "见基线看板" : ""}`} />
      </div>

      <div className="adm-grid-icons">
        {/* ===== 转化漏斗 ===== */}
        <Card title="转化漏斗" small={baseline.note || ""}>
          {baseline.funnel.map((f) => (
            <div key={f.step} style={{ marginBottom: 12 }}>
              <div className="adm-row" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{f.step}</span>
                <span className="adm-spacer adm-muted" style={{ fontSize: 12 }}>{f.count}</span>
              </div>
              <div className="adm-hbar"><div style={{ width: `${(f.count / maxFunnel) * 100}%` }} /></div>
            </div>
          ))}
        </Card>

        {/* ===== 告警 ===== */}
        <Card title="告警状态" small="退货率 / AI 覆盖 / 管道丢弃 / 5xx 率"
          extra={<a className="adm-btn adm-btn-outline adm-btn-sm" href="/admin/monitoring">监控看板</a>}>
          {monitor.alerts.active.length ? (
            monitor.alerts.active.map((a) => (
              <div key={a.rule} style={{ marginBottom: 8 }}>
                <Badge tone={a.level === "critical" ? "err" : "warn"}>{a.level}</Badge>{" "}
                <span style={{ fontSize: 12 }}>{a.label}</span>
              </div>
            ))
          ) : (
            <Empty>无活跃告警 —— 四条规则均正常</Empty>
          )}
        </Card>

        {/* ===== 埋点事件 TOP ===== */}
        <Card title="埋点事件 TOP 8" small={`已发 ${monitor.pipeline.emitted} · 丢弃 ${monitor.pipeline.discarded} · sinks: ${monitor.pipeline.sinks.join(",")}`}>
          {monitor.eventsByType.length ? (
            <table className="adm-table">
              <thead><tr><th>事件</th><th>次数</th></tr></thead>
              <tbody>
                {monitor.eventsByType.map((e) => (
                  <tr key={e.type}>
                    <td className="adm-mono">{e.type}</td>
                    <td style={{ fontWeight: 700 }}>{e.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>暂无埋点数据</Empty>
          )}
        </Card>

        {/* ===== HTTP RED ===== */}
        <Card title="HTTP 服务质量（RED）" small="请求量 / 5xx / 延迟 p95">
          {monitor.http.length ? (
            <table className="adm-table">
              <thead><tr><th>路由</th><th>请求</th><th>5xx</th><th>p95 (ms)</th></tr></thead>
              <tbody>
                {monitor.http.slice(0, 8).map((r) => (
                  <tr key={r.route}>
                    <td className="adm-mono">{r.route}</td>
                    <td>{r.requests.toLocaleString()}</td>
                    <td style={{ color: r.errors5xx ? "#b3362a" : undefined, fontWeight: r.errors5xx ? 700 : 400 }}>{r.errors5xx}</td>
                    <td>{r.p95Ms ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>暂无 HTTP 指标</Empty>
          )}
        </Card>

        {/* ===== Core Web Vitals（RUM p75）===== */}
        <Card title="Core Web Vitals（真实用户 p75）" small="useReportWebVitals → 统一事件管道">
          {monitor.vitals.length ? (
            <table className="adm-table">
              <thead><tr><th>指标</th><th>p75</th><th>样本</th></tr></thead>
              <tbody>
                {monitor.vitals.map((v) => (
                  <tr key={v.name}>
                    <td style={{ fontWeight: 700 }}>{v.name}</td>
                    <td>{v.p75} {v.unit}</td>
                    <td className="adm-muted">{v.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>暂无 RUM 样本（打开前台页面即开始采集）</Empty>
          )}
        </Card>
      </div>

      <p className="adm-muted" style={{ fontSize: 11 }}>
        数据口径与告警规则见监控看板（/admin/monitoring）· 转化/退货基线见基线看板（/admin/baseline）
      </p>
    </>
  );
}
