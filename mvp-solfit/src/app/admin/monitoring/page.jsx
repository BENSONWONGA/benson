/**
 * /admin/monitoring — Phase 4 看板：埋点管道健康 + RED + KPI/RUM + 告警
 * 数据由 MonitoringDashboard 轮询 /api/monitoring/overview（服务端聚合）。
 * Prometheus 抓 /api/metrics；容器探针打 /api/health。
 */

import MonitoringDashboard from "@/components/MonitoringDashboard";

export const metadata = { title: "监控看板" };
export const dynamic = "force-dynamic";

export default function MonitoringPage() {
  return (
    <div className="container" style={{ padding: "48px 24px 96px" }}>
      <div className="eyebrow">Phase 4 里程碑</div>
      <h1 style={{ fontSize: 36, marginBottom: 8 }}>埋点管道与监控</h1>
      <p className="muted" style={{ marginBottom: 32 }}>
        统一事件管道（schema 校验 → 指标 → sinks）· HTTP RED · Core Web Vitals RUM ·
        阈值告警（退货率 / AI 覆盖率 / 管道丢弃 / 5xx 率）
      </p>
      <MonitoringDashboard />
    </div>
  );
}
