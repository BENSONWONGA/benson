"use client";

/**
 * MonitoringDashboard — Phase 4 监控看板（客户端轮询 /api/monitoring/overview）
 * 四块视图：管道健康 / HTTP RED / 业务 KPI + RUM / 告警。
 * 5s 轮询 + 手动刷新；数据聚合在服务端完成，本组件只做展示。
 * 视觉：iOS 26 液态玻璃（admin.css 的 .adm-* 命名空间，由页面外层的
 * AdminFrame 提供壁纸与令牌；本组件只做展示层，数据逻辑不变）。
 */

import { useCallback, useEffect, useState } from "react";
import { Card, Kpi, Badge, Empty } from "@/components/admin/ui";

const POLL_MS = 5000;

const LEVEL_COLOR = { critical: "var(--adm-err)", warn: "var(--adm-warn)", ok: "var(--adm-ok)" };
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

  if (error) return <Card><Empty>监控数据加载失败：{error}（重试中…）</Empty></Card>;
  if (!data) return <Card><Empty>加载中…</Empty></Card>;

  const { pipeline, eventsByType, http, kpis, vitals, alerts, rec, marketing } = data;
  const maxEvent = Math.max(1, ...eventsByType.map((e) => e.count));

  return (
    <div>
      {/* ===== 管道健康 ===== */}
      <Card title="Tracking pipeline">
        <div className="adm-kpis" style={{ marginBottom: 0 }}>
          <Kpi num={fmt(pipeline.emitted)} lbl="Events emitted" />
          <Kpi num={fmt(pipeline.discarded)} lbl="Dropped (schema/overflow)" tone={pipeline.discarded > 10 ? "warn" : undefined} />
          <Kpi num={pipeline.schemaEvents} lbl="Schema events" />
          <div className="adm-kpi">
            <div className="adm-kpi-num" style={{ fontSize: 14 }}>{pipeline.sinks.join(" · ") || "—"}</div>
            <div className="adm-kpi-lbl">Sinks (kafka: {pipeline.kafka})</div>
          </div>
        </div>
      </Card>

      {/* ===== 事件吞吐 ===== */}
      <Card title="Events by type">
        {eventsByType.length ? eventsByType.map((e) => (
          <div key={e.type} style={{ marginBottom: 12 }}>
            <div className="adm-row" style={{ marginBottom: 4 }}>
              <span className="adm-mono" style={{ fontSize: 12, fontWeight: 700 }}>{e.type}</span>
              <span className="adm-spacer adm-muted" style={{ fontSize: 12, fontWeight: 700 }}>{e.count}</span>
            </div>
            <div className="adm-hbar"><div style={{ width: `${(e.count / maxEvent) * 100}%` }} /></div>
          </div>
        )) : <Empty>暂无事件</Empty>}
      </Card>

      {/* ===== HTTP RED ===== */}
      <Card title="HTTP — rate / errors / duration">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Route</th><th>Requests</th><th>5xx</th><th>p50</th><th>p95</th>
            </tr>
          </thead>
          <tbody>
            {http.length ? http.map((r) => (
              <tr key={r.route}>
                <td className="adm-mono">{r.route}</td>
                <td>{fmt(r.requests)}</td>
                <td style={{ color: r.errors5xx ? LEVEL_COLOR.critical : undefined, fontWeight: r.errors5xx ? 700 : 400 }}>{r.errors5xx || 0}</td>
                <td>{r.p50Ms === null ? "—" : r.p50Ms + "ms"}</td>
                <td>{r.p95Ms === null ? "—" : r.p95Ms + "ms"}</td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="adm-muted" style={{ padding: "12px 10px" }}>暂无 HTTP 流量</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* ===== 业务 KPI + RUM ===== */}
      <Card title="Business KPIs">
        <div className="adm-kpis" style={{ marginBottom: 0 }}>
          <Kpi num={`${kpis.rates.viewToCart}%`} lbl="View → Cart" />
          <Kpi num={`${kpis.rates.cartToOrder}%`} lbl="Cart → Order" />
          <Kpi num={`${kpis.kpis.returnRate}%`} lbl={"Return rate (target <12%)"} tone={kpis.kpis.returnRate > 12 ? "warn" : undefined} />
        </div>
      </Card>

      {/* ===== 推荐模型（Phase 5）===== */}
      <Card title={"Recommendation model — A/B & learned ranking"}>
        <div className="adm-kpis" style={{ marginBottom: 0 }}>
          {(rec?.experiment?.variants ?? []).map((v) => (
            <Kpi key={v} num={fmt(rec?.model?.variantCounts?.[v])} lbl={`Variant “${v}” served`} />
          ))}
          <Kpi
            num={rec?.model?.warm ? "warm" : "cold"}
            tone={rec?.model?.warm ? "ok" : "warn"}
            lbl={
              <>
                LR ranker — {fmt(rec?.model?.samples)} labeled / {fmt(rec?.model?.impressions)} impressions
                {rec?.model?.auc !== null && rec?.model?.auc !== undefined ? ` · AUC ${rec.model.auc}` : ""} · {rec?.model?.note}
              </>
            }
          />
        </div>
      </Card>

      {/* ===== 实验效果回流（Phase 6）===== */}
      {(rec?.lift ?? []).length ? (
        <Card title="Experiment lift — conversion by variant">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Variant</th><th>Impressions</th><th>Decided</th><th>Positives</th><th>CTR</th><th>Lift vs baseline</th>
              </tr>
            </thead>
            <tbody>
              {rec.lift.map((v) => (
                <tr key={v.variant}>
                  <td className="adm-mono">{v.variant}</td>
                  <td>{fmt(v.impressions)}</td>
                  <td>{fmt(v.decided)}</td>
                  <td>{fmt(v.positives)}</td>
                  <td>{v.ctr === null ? "—" : (v.ctr * 100).toFixed(1) + "%"}</td>
                  <td style={{ color: v.liftVsBaselinePct > 0 ? LEVEL_COLOR.ok : v.liftVsBaselinePct < 0 ? LEVEL_COLOR.critical : undefined, fontWeight: 700 }}>
                    {v.liftVsBaselinePct === null || v.liftVsBaselinePct === undefined ? "—" : (v.liftVsBaselinePct > 0 ? "+" : "") + v.liftVsBaselinePct + "%"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {/* ===== 营销召回投递（Phase 6）===== */}
      <Card title="Marketing recovery — abandoned carts">
        <div className="adm-kpis" style={{ marginBottom: 0 }}>
          <Kpi num={fmt((marketing?.emails ?? []).find((e) => e.result === "sent")?.count)} lbl="Emails sent" />
          <Kpi
            num={fmt((marketing?.emails ?? []).filter((e) => e.result.startsWith("suppressed")).reduce((s, e) => s + e.count, 0))}
            lbl="Suppressed (频控/无地址)"
            tone="warn"
          />
          <Kpi
            num={fmt((marketing?.emails ?? []).find((e) => e.result === "failed")?.count)}
            lbl="Failed"
            tone={(marketing?.emails ?? []).find((e) => e.result === "failed")?.count ? "err" : undefined}
          />
          <div className="adm-kpi">
            <div className="adm-kpi-num" style={{ fontSize: 14 }}>{marketing?.provider ?? "—"}</div>
            <div className="adm-kpi-lbl">
              {fmt(marketing?.sendsToday)}/{fmt(marketing?.limits?.dailyCap)} today ·
              {" "}{fmt(marketing?.subscribers)} subs · outbox {fmt(marketing?.outboxDepth)}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Core Web Vitals (RUM p75)">
        {vitals.length ? (
          <div className="adm-kpis" style={{ marginBottom: 0, gridTemplateColumns: `repeat(${Math.min(vitals.length, 4)}, 1fr)` }}>
            {vitals.map((v) => {
              const target = VITAL_TARGET[v.name];
              const good = target === undefined || v.p75 <= target;
              return (
                <Kpi key={v.name} num={`${v.p75}${v.unit}`} lbl={`${v.name} · ${v.samples} samples`} tone={good ? undefined : "warn"} />
              );
            })}
          </div>
        ) : <Empty>暂无 RUM 样本（需用户同意 analytics 后由浏览器上报）</Empty>}
      </Card>

      {/* ===== 告警 ===== */}
      <Card title="Alerts">
        {alerts.active.length ? alerts.active.map((a) => (
          <div key={a.rule} style={{ border: `1px solid ${LEVEL_COLOR[a.level]}`, background: "rgba(255, 255, 255, 0.45)", borderRadius: 12, padding: "10px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13 }}>
              <Badge tone={a.level === "critical" ? "err" : "warn"}>{a.level}</Badge>{" "}
              {a.label}
            </span>
            <span className="adm-muted" style={{ fontSize: 12 }}>{ago(a.since)}</span>
          </div>
        )) : <p className="adm-muted" style={{ marginBottom: 8, fontSize: 13 }}>✓ 无活跃告警</p>}

        {alerts.history.length ? (
          <table className="adm-table" style={{ fontSize: 12 }}>
            <tbody>
              {alerts.history.slice(0, 6).map((h, i) => (
                <tr key={i}>
                  <td style={{ color: LEVEL_COLOR[h.level], fontWeight: 700, width: 70 }}>{h.level === "ok" ? "resolved" : h.level}</td>
                  <td className="adm-mono">{h.rule}</td>
                  <td>{h.value}{h.unit ?? ""}</td>
                  <td className="adm-muted" style={{ textAlign: "right" }}>{ago(h.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Card>

      <p className="adm-muted" style={{ marginTop: 20, fontSize: 12 }}>
        {refreshing ? "刷新中…" : "自动刷新 5s"} · 数据时间 {new Date(data.generatedAt).toLocaleTimeString()} ·
        抓取端点 <a href="/api/metrics">/api/metrics</a> · 探针 <a href="/api/health">/api/health</a>
      </p>
    </div>
  );
}
