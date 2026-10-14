import { NextResponse } from "next/server";
import { prometheusText } from "@/lib/metrics";
import { evaluateAlerts } from "@/lib/alerts";

/**
 * GET /api/metrics — Prometheus 抓取端点（Phase 4）
 *
 * 指标族：
 *   solfit_events_total{type}                    埋点吞吐
 *   solfit_events_discarded_total{reason}        管道丢弃（schema/overflow/unknown_event）
 *   solfit_http_requests_total{route,code}      HTTP Rate/Errors（RED）
 *   solfit_http_request_duration_seconds{route}  HTTP Duration（直方图，累积桶）
 *   solfit_kpi_*                                 业务 KPI gauge（评估时刷新）
 *   solfit_alerts_fired_total{rule,level}        告警触发
 *
 * 抓取周期顺带驱动告警评估（内部 60s 节流）—— 未部署独立定时器的兜底路径。
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    evaluateAlerts();
  } catch { /* 评估失败不阻塞指标导出 */ }
  return new NextResponse(prometheusText(), {
    status: 200,
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
