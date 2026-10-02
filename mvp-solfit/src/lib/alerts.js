/**
 * lib/alerts.js — 告警规则引擎（Phase 4：监控）
 *
 * 数据源：analytics 基线（业务 KPI）+ pipeline 统计（管道健康）+ metrics（HTTP RED）。
 * 规则阈值与方案文档 §8.1/§9 对齐：
 *   - 退货率 >12% warn / >18% critical（AI 目标 12%，行业均值上限 18%）
 *   - AI 尺码覆盖率 <60% warn（Phase 2 里程碑：>60% 订单覆盖）
 *   - 管道丢弃 >10 warn / >100 critical（埋点即数据资产，丢数据必须有人知道）
 *   - HTTP 5xx 率 >5% warn / >10% critical（最小样本 20，防小样本误报）
 *
 * 去抖：状态机只在级别变化时通知（firing / resolved），天然避免告警风暴；
 * 评估本身 60s 节流 —— 由 /api/metrics 抓取或 30s 定时器驱动。
 * 通知 sink：默认结构化日志；ALERT_WEBHOOK_URL 配置后同步 POST（Slack/飞书 webhook 通用）。
 */

import { counter, gauge, metricsSnapshot } from "@/lib/metrics";
import { baselineSnapshot } from "@/lib/analytics";
import { pipelineStats } from "@/lib/pipeline";

const alertsFired = counter("solfit_alerts_fired_total");
const kpiReturnRate = gauge("solfit_kpi_return_rate_percent");
const kpiAiCoverage = gauge("solfit_kpi_ai_coverage_percent");
const kpiGmv = gauge("solfit_kpi_gmv_usd");

const COOLDOWN_HINT = "level-change only"; // 状态机语义说明（见文件头）
const HISTORY_CAP = 50;
const _history = []; // { rule, level, value, at }
const _state = new Map(); // ruleId -> { level, since, at }
let _lastEvaluatedAt = 0;

/**
 * 规则表 —— value 从评估上下文取数；minSamples 以下的低置信数据不告警
 * 阈值语义：warn/critical = { above } 或 { below }
 */
const RULES = [
  {
    id: "return_rate_high",
    label: "Return rate above AI target",
    unit: "%",
    minSamples: (ctx) => ctx.kpis.ordersTotal >= 5,
    value: (ctx) => ctx.kpis.returnRate,
    warn: { above: 12 },
    critical: { above: 18 },
  },
  {
    id: "ai_coverage_low",
    label: "AI size coverage below target",
    unit: "%",
    minSamples: (ctx) => ctx.kpis.ordersTotal >= 5,
    value: (ctx) => ctx.kpis.aiCoverage,
    warn: { below: 60 },
  },
  {
    id: "events_discarded",
    label: "Tracking pipeline dropped events",
    minSamples: () => true,
    value: (ctx) => ctx.pipeline.discarded,
    warn: { above: 10 },
    critical: { above: 100 },
  },
  {
    id: "http_5xx_rate",
    label: "HTTP 5xx error rate",
    unit: "%",
    minSamples: (ctx) => ctx.http.requests >= 20,
    value: (ctx) => ctx.http.rate5xx,
    warn: { above: 5 },
    critical: { above: 10 },
  },
];

/** HTTP 5xx 率（从 RED 指标聚合，无请求时为 0） */
function httpContext() {
  const snap = metricsSnapshot().find((m) => m.name === "solfit_http_requests_total");
  let requests = 0;
  let errors5xx = 0;
  for (const s of snap?.series ?? []) {
    requests += s.value;
    if (String(s.labels.code).startsWith("5")) errors5xx += s.value;
  }
  return { requests, rate5xx: requests ? Math.round((errors5xx / requests) * 1000) / 10 : 0 };
}

function thresholdHit(th, v) {
  if (!th) return false;
  if (th.above !== undefined) return v > th.above;
  if (th.below !== undefined) return v < th.below;
  return false;
}

function levelFor(rule, v) {
  if (thresholdHit(rule.critical, v)) return "critical";
  if (thresholdHit(rule.warn, v)) return "warn";
  return "ok";
}

/** 通知 sink：日志（始终）+ webhook（配置即启用）。通知失败绝不影响主流程。 */
async function notify(rule, level, value) {
  alertsFired.inc(1, { rule: rule.id, level });
  _history.push({ rule: rule.id, label: rule.label, level, value, at: new Date().toISOString() });
  if (_history.length > HISTORY_CAP) _history.shift();

  const line = `[alert] ${rule.id} ${level} value=${value}${rule.unit ?? ""} (${COOLDOWN_HINT})`;
  if (level === "critical") console.error(line);
  else console.warn(line);

  const url = process.env.ALERT_WEBHOOK_URL;
  if (url) {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule: rule.id, label: rule.label, level, value, unit: rule.unit ?? null, ts: new Date().toISOString() }),
    }).catch(() => {}); // webhook 挂了下次级别变化还会再触发
  }
}

/**
 * 评估全部规则（内部 60s 节流，force=true 跳过 —— 看板"立即评估"用）
 * 副作用：KPI gauge 刷新（/api/metrics 导出业务指标）
 */
export function evaluateAlerts({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - _lastEvaluatedAt < 60_000) return alertsState();
  _lastEvaluatedAt = now;

  const kpis = baselineSnapshot().kpis;
  const pipeline = pipelineStats();
  const http = httpContext();

  // KPI gauge 刷新 —— Prometheus 抓取即可见（solfit_kpi_*）
  kpiReturnRate.set(kpis.returnRate);
  kpiAiCoverage.set(kpis.aiCoverage);
  kpiGmv.set(Math.round(kpis.gmvUsd));

  const ctx = { kpis, pipeline, http };
  for (const rule of RULES) {
    if (!rule.minSamples(ctx)) continue; // 样本不足 —— 宁可沉默，不用噪声数据告警
    const v = rule.value(ctx);
    if (v === null || v === undefined || Number.isNaN(v)) continue;

    const level = levelFor(rule, v);
    const prev = _state.get(rule.id) || { level: "ok", since: Date.now() };
    if (level !== prev.level) {
      notify(rule, level, v); // firing（ok→warn/critical）或 resolved（→ok）
      _state.set(rule.id, { level, since: Date.now() });
    }
  }
  return alertsState();
}

/** 当前告警状态（看板取数） */
export function alertsState() {
  return {
    active: [..._state.entries()]
      .filter(([, s]) => s.level !== "ok")
      .map(([rule, s]) => {
        const def = RULES.find((r) => r.id === rule);
        return { rule, label: def.label, level: s.level, since: new Date(s.since).toISOString() };
      }),
    history: [..._history].reverse(), // 最新在前
    rules: RULES.map((r) => ({ id: r.id, label: r.label })),
  };
}

/** 定时评估器 —— instrumentation.register() 启动（30s 周期；评估内部另有 60s 节流） */
export function startEvaluator() {
  const timer = setInterval(() => {
    try {
      evaluateAlerts();
    } catch (err) {
      console.error("[alerts] evaluator failed:", err.message);
    }
  }, 30_000);
  timer.unref?.(); // 不阻止进程退出（build/静态导出安全）
  console.log("[alerts] evaluator started (30s interval)");
  return timer;
}
