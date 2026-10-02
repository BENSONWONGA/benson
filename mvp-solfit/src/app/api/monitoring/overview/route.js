import { NextResponse } from "next/server";
import { metricsSnapshot } from "@/lib/metrics";
import { pipelineStats } from "@/lib/pipeline";
import { evaluateAlerts, alertsState } from "@/lib/alerts";
import { baselineSnapshot } from "@/lib/analytics";
import { recStats } from "@/ai/recommender";
import { retentionStats } from "@/ai/retention";
import { notificationStats } from "@/modules/notification/service";
import { store } from "@/lib/db";

/**
 * GET /api/monitoring/overview — 监控看板数据（Phase 4，/admin/monitoring 轮询）
 * 聚合四块：管道健康 / HTTP RED / 业务 KPI / RUM(Core Web Vitals p75) + 告警状态。
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VITAL_UNITS = { LCP: "ms", FCP: "ms", TTFB: "ms", INP: "ms", CLS: "", TBT: "ms" };

/** RUM 聚合：web_vitals 事件按指标名取 p75（Google 门户标准口径） */
function rumVitals() {
  const buckets = {};
  for (const e of store("events")) {
    if (e.type !== "web_vitals") continue;
    const { name, value } = e.payload || {};
    if (!name || typeof value !== "number") continue;
    (buckets[name] = buckets[name] || []).push(value);
  }
  return Object.entries(buckets)
    .map(([name, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        name,
        unit: VITAL_UNITS[name] ?? "",
        samples: values.length,
        p75: Math.round(sorted[Math.floor(sorted.length * 0.75)] * 100) / 100,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** HTTP RED：按路由聚合请求量 / 5xx / 延迟分位 */
function httpRed() {
  const snap = metricsSnapshot();
  const total = snap.find((m) => m.name === "solfit_http_requests_total");
  const dur = snap.find((m) => m.name === "solfit_http_request_duration_seconds");

  const byRoute = new Map(); // route -> { requests, errors5xx, quantiles }
  for (const s of total?.series ?? []) {
    const r = byRoute.get(s.labels.route) || { requests: 0, errors5xx: 0 };
    r.requests += s.value;
    if (String(s.labels.code).startsWith("5")) r.errors5xx += s.value;
    byRoute.set(s.labels.route, r);
  }
  for (const s of dur?.series ?? []) {
    const r = byRoute.get(s.labels.route);
    if (r && s.quantiles) r.quantiles = s.quantiles; // 该路由最近样本的分位数
  }
  return [...byRoute.entries()]
    .map(([route, r]) => ({
      route,
      requests: r.requests,
      errors5xx: r.errors5xx,
      p50Ms: r.quantiles ? Math.round(r.quantiles.p50 * 1000) : null,
      p95Ms: r.quantiles ? Math.round(r.quantiles.p95 * 1000) : null,
    }))
    .sort((a, b) => b.requests - a.requests);
}

export async function GET(request) {
  // ?force=1 跳过 60s 节流 —— 看板"立即评估"与运维手动触发
  evaluateAlerts({ force: request.nextUrl.searchParams.get("force") === "1" });

  const eventsByType = (metricsSnapshot().find((m) => m.name === "solfit_events_total")?.series ?? [])
    .map((s) => ({ type: s.labels.type, count: s.value }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // 营销投递结果累计（Phase 6，由 solfit_marketing_emails_total 聚合）
  const marketingEmails = (metricsSnapshot().find((m) => m.name === "solfit_marketing_emails_total")?.series ?? [])
    .map((s) => ({ result: s.labels.result, count: s.value }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    code: 0,
    data: {
      pipeline: pipelineStats(),
      eventsByType,
      http: httpRed(),
      kpis: baselineSnapshot(),
      vitals: rumVitals(),
      alerts: alertsState(),
      rec: recStats(), // Phase 5：A/B 分流 + 质量门；Phase 6：实验 lift 回流
      marketing: { ...notificationStats(), emails: marketingEmails }, // Phase 6
      retention: retentionStats(), // Phase 7：RFM 分层 + 场景命中 + 调度器
      generatedAt: new Date().toISOString(),
    },
  });
}
