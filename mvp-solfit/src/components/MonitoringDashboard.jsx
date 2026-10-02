"use client";

/**
 * MonitoringDashboard — Phase 4 监控看板（客户端轮询 /api/monitoring/overview）
 * 四块视图：管道健康 / HTTP RED / 业务 KPI + RUM / 告警。
 * 5s 轮询 + 手动刷新；数据聚合在服务端完成，本组件只做展示。
 */

import { useCallback, useEffect, useState } from "react";

const POLL_MS = 5000;

const LEVEL_COLOR = { critical: "#C0392B", warn: "#D4880F", ok: "var(--fit)" };
const VITAL_TARGET = { LCP: 2500, INP: 200, CLS: 0.1, TTFB: 800, FCP: 1800 }; // Google "good" 门槛

function fmt(n) {
  if (n === null || n === undefined) return "—";
  return typeof n === "number" ? n.toLocaleString() : n;
}

function ago(iso) {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return sec + "s ago";
  if (sec < 3600) return Math.round(sec / 60) + "m ago";
  return Math.round(sec / 3600) + "h ago";
}

export default function MonitoringDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/monitoring/overview", { cache: "no-store" });
      const body = await res.json();
      if (body.code !== 0) throw new Error(body.message || "bad response");
      setData(body.data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <p className="muted">监控数据加载失败：{error}（重试中…）</p>;
  if (!data) return <p className="muted">加载中…</p>;

  const { pipeline, eventsByType, http, kpis, vitals, alerts, rec, marketing } = data;
  const maxEvent = Math.max(1, ...eventsByType.map((e) => e.count));

  return (
    <div>
      {/* ===== 管道健康 ===== */}
      <h3 style={{ margin: "36px 0 16px" }}>Tracking pipeline</h3>
      <div className="baseline-kpis" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="stat-box"><div className="num">{fmt(pipeline.emitted)}</div><div className="lbl">Events emitted</div></div>
        <div className="stat-box">
          <div className="num" style={{ color: pipeline.discarded > 10 ? LEVEL_COLOR.warn : undefined }}>{fmt(pipeline.discarded)}</div>
          <div className="lbl">Dropped (schema/overflow)</div>
        </div>
        <div className="stat-box"><div className="num">{pipeline.schemaEvents}</div><div className="lbl">Schema events</div></div>
        <div className="stat-box"><div className="num" style={{ fontSize: 15, paddingTop: 6 }}>{pipeline.sinks.join(" · ") || "—"}<div className="lbl">Sinks (kafka: {pipeline.kafka})</div></div></div>
      </div>

      {/* ===== 事件吞吐 ===== */}
      <h3 style={{ margin: "36px 0 16px" }}>Events by type</h3>
      {eventsByType.length ? eventsByType.map((e) => (
        <div key={e.type} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
            <span style={{ fontFamily: "var(--font-display)" }}>{e.type}</span><b>{e.count}</b>
          </div>
          <div style={{ background: "#EFE8DC", borderRadius: 999, height: 8, overflow: "hidden" }}>
            <div style={{ width: `${(e.count / maxEvent) * 100}%`, height: "100%", background: "var(--fit)", borderRadius: 999 }} />
          </div>
        </div>
      )) : <p className="muted">暂无事件</p>}

      {/* ===== HTTP RED ===== */}
      <h3 style={{ margin: "36px 0 16px" }}>HTTP — rate / errors / duration</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--text-sub)" }}>
            <th style={{ padding: "6px 0" }}>Route</th><th>Requests</th><th>5xx</th><th>p50</th><th>p95</th>
          </tr>
        </thead>
        <tbody>
          {http.length ? http.map((r) => (
            <tr key={r.route} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "7px 0", fontFamily: "var(--font-display)" }}>{r.route}</td>
              <td>{fmt(r.requests)}</td>
              <td style={{ color: r.errors5xx ? LEVEL_COLOR.critical : undefined }}>{r.errors5xx || 0}</td>
              <td>{r.p50Ms === null ? "—" : r.p50Ms + "ms"}</td>
              <td>{r.p95Ms === null ? "—" : r.p95Ms + "ms"}</td>
            </tr>
          )) : (
            <tr><td colSpan={5} className="muted" style={{ padding: "8px 0" }}>暂无 HTTP 流量</td></tr>
          )}
        </tbody>
      </table>

      {/* ===== 业务 KPI + RUM ===== */}
      <h3 style={{ margin: "36px 0 16px" }}>Business KPIs</h3>
      <div className="baseline-kpis" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="stat-box"><div className="num">{kpis.rates.viewToCart}%</div><div className="lbl">View → Cart</div></div>
        <div className="stat-box"><div className="num">{kpis.rates.cartToOrder}%</div><div className="lbl">Cart → Order</div></div>
        <div className="stat-box">
          <div className="num" style={{ color: kpis.kpis.returnRate > 12 ? LEVEL_COLOR.warn : undefined }}>{kpis.kpis.returnRate}%</div>
          <div className="lbl">Return rate (target &lt;12%)</div>
        </div>
      </div>

      {/* ===== 推荐模型（Phase 5）===== */}
      <h3 style={{ margin: "36px 0 16px" }}>Recommendation model — A/B &amp; learned ranking</h3>
      <div className="baseline-kpis" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {(rec?.experiment?.variants ?? []).map((v) => (
          <div className="stat-box" key={v}>
            <div className="num">{fmt(rec?.model?.variantCounts?.[v])}</div>
            <div className="lbl">Variant “{v}” served</div>
          </div>
        ))}
        <div className="stat-box">
          <div className="num" style={{ color: rec?.model?.warm ? "var(--fit)" : LEVEL_COLOR.warn }}>
            {rec?.model?.warm ? "warm" : "cold"}
          </div>
          <div className="lbl">
            LR ranker — {fmt(rec?.model?.samples)} labeled / {fmt(rec?.model?.impressions)} impressions
            {rec?.model?.auc !== null && rec?.model?.auc !== undefined ? ` · AUC ${rec.model.auc}` : ""} · {rec?.model?.note}
          </div>
        </div>
      </div>

      {/* ===== 实验效果回流（Phase 6）===== */}
      {(rec?.lift ?? []).length ? (
        <>
          <h3 style={{ margin: "36px 0 16px" }}>Experiment lift — conversion by variant</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-sub)" }}>
                <th style={{ padding: "6px 0" }}>Variant</th><th>Impressions</th><th>Decided</th><th>Positives</th><th>CTR</th><th>Lift vs baseline</th>
              </tr>
            </thead>
            <tbody>
              {rec.lift.map((v) => (
                <tr key={v.variant} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 0", fontFamily: "var(--font-display)" }}>{v.variant}</td>
                  <td>{fmt(v.impressions)}</td>
                  <td>{fmt(v.decided)}</td>
                  <td>{fmt(v.positives)}</td>
                  <td>{v.ctr === null ? "—" : (v.ctr * 100).toFixed(1) + "%"}</td>
                  <td style={{ color: v.liftVsBaselinePct > 0 ? "var(--fit)" : v.liftVsBaselinePct < 0 ? LEVEL_COLOR.critical : undefined }}>
                    {v.liftVsBaselinePct === null || v.liftVsBaselinePct === undefined ? "—" : (v.liftVsBaselinePct > 0 ? "+" : "") + v.liftVsBaselinePct + "%"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {/* ===== 营销召回投递（Phase 6）===== */}
      <h3 style={{ margin: "36px 0 16px" }}>Marketing recovery — abandoned carts</h3>
      <div className="baseline-kpis" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="stat-box">
          <div className="num">{fmt((marketing?.emails ?? []).find((e) => e.result === "sent")?.count)}</div>
          <div className="lbl">Emails sent</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: LEVEL_COLOR.warn }}>
            {fmt((marketing?.emails ?? []).filter((e) => e.result.startsWith("suppressed")).reduce((s, e) => s + e.count, 0))}
          </div>
          <div className="lbl">Suppressed (频控/无地址)</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ color: (marketing?.emails ?? []).find((e) => e.result === "failed")?.count ? LEVEL_COLOR.critical : undefined }}>
            {fmt((marketing?.emails ?? []).find((e) => e.result === "failed")?.count)}
          </div>
          <div className="lbl">Failed</div>
        </div>
        <div className="stat-box">
          <div className="num" style={{ fontSize: 15, paddingTop: 6 }}>{marketing?.provider ?? "—"}
            <div className="lbl">
              {fmt(marketing?.sendsToday)}/{fmt(marketing?.limits?.dailyCap)} today ·
              {" "}{fmt(marketing?.subscribers)} subs · outbox {fmt(marketing?.outboxDepth)}
            </div>
          </div>
        </div>
      </div>

      <h3 style={{ margin: "36px 0 16px" }}>Core Web Vitals (RUM p75)</h3>
      {vitals.length ? (
        <div className="baseline-kpis" style={{ gridTemplateColumns: `repeat(${Math.min(vitals.length, 4)}, 1fr)` }}>
          {vitals.map((v) => {
            const target = VITAL_TARGET[v.name];
            const good = target === undefined || v.p75 <= target;
            return (
              <div className="stat-box" key={v.name}>
                <div className="num" style={{ color: good ? undefined : LEVEL_COLOR.warn }}>{v.p75}{v.unit}</div>
                <div className="lbl">{v.name} · {v.samples} samples</div>
              </div>
            );
          })}
        </div>
      ) : <p className="muted">暂无 RUM 样本（需用户同意 analytics 后由浏览器上报）</p>}

      {/* ===== 告警 ===== */}
      <h3 style={{ margin: "36px 0 16px" }}>Alerts</h3>
      {alerts.active.length ? alerts.active.map((a) => (
        <div key={a.rule} style={{ border: `1px solid ${LEVEL_COLOR[a.level]}`, borderRadius: 12, padding: "10px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
          <span><b style={{ color: LEVEL_COLOR[a.level], textTransform: "uppercase", fontSize: 11, letterSpacing: "0.08em" }}>{a.level}</b> · {a.label}</span>
          <span className="muted">{ago(a.since)}</span>
        </div>
      )) : <p className="muted" style={{ marginBottom: 8 }}>✓ 无活跃告警</p>}

      {alerts.history.length ? (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 12 }}>
          <tbody>
            {alerts.history.slice(0, 6).map((h, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "6px 0", color: LEVEL_COLOR[h.level], fontWeight: 700, width: 70 }}>{h.level === "ok" ? "resolved" : h.level}</td>
                <td style={{ fontFamily: "var(--font-display)" }}>{h.rule}</td>
                <td>{h.value}{h.unit ?? ""}</td>
                <td className="muted" style={{ textAlign: "right" }}>{ago(h.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <p className="muted" style={{ marginTop: 24 }}>
        {refreshing ? "刷新中…" : "自动刷新 5s"} · 数据时间 {new Date(data.generatedAt).toLocaleTimeString()} ·
        抓取端点 <a href="/api/metrics">/api/metrics</a> · 探针 <a href="/api/health">/api/health</a>
      </p>
    </div>
  );
}
