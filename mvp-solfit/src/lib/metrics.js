/**
 * lib/metrics.js — 指标库（Phase 4：埋点与监控）
 *
 * 职责：进程内指标原语（Counter / Gauge / Histogram）+ Prometheus 文本导出。
 * 命名规范：solfit_<域>_<名>（http/events/pipeline/alerts/kpi）。
 *
 * GDPR：label 值只允许路由名/事件类型/状态码等枚举值 —— 指标层永不携带 PII。
 *
 * 演进（与 cache.js 同款策略，零依赖开箱可跑）：
 *   Phase 4（当前）: 内存实现，Prometheus pull 抓取（/api/metrics）
 *   Phase 5      : 原位换 prom-client / OpenTelemetry SDK —— 本文件签名不变，
 *                  调用方（observe/pipeline/alerts/overview）零改动
 */

const _registry = new Map(); // name -> { kind, name, buckets?, series: Map(seriesKey -> series) }
const SAMPLES_PER_SERIES = 256; // 直方图原始观测留存（dashboard 分位数用，非导出）

function getMetric(name, kind) {
  let m = _registry.get(name);
  if (!m) {
    m = { kind, name, series: new Map() };
    _registry.set(name, m);
  }
  if (m.kind !== kind) throw new Error(`Metric ${name} already registered as ${m.kind}`);
  return m;
}

/** series 内部键：label 键值排序后序列化，保证同 label 集合命中同 series */
function seriesKey(labels) {
  const keys = Object.keys(labels).sort();
  if (!keys.length) return "";
  return keys.map((k) => `${k}=${JSON.stringify(String(labels[k]))}`).join(",");
}

/** Prometheus label 段：{route="checkout",code="200"} 或空串 */
function labelStr(labels) {
  const keys = Object.keys(labels).sort();
  if (!keys.length) return "";
  return "{" + keys.map((k) => `${k}=${JSON.stringify(String(labels[k]))}`).join(",") + "}";
}

/** 单调递增计数器（埋点吞吐 / HTTP 请求量 / 告警触发） */
export function counter(name) {
  const m = getMetric(name, "counter");
  return {
    inc(value = 1, labels = {}) {
      const k = seriesKey(labels);
      const s = m.series.get(k) || { labels, value: 0 };
      s.value += value;
      m.series.set(k, s);
    },
  };
}

/** 瞬时值（KPI gauge：退货率 / AI 覆盖率 / 缓冲深度） */
export function gauge(name) {
  const m = getMetric(name, "gauge");
  return {
    set(value, labels = {}) {
      m.series.set(seriesKey(labels), { labels, value });
    },
  };
}

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]; // 秒

/** 直方图（HTTP 延迟等）—— 累积桶满足 Prometheus 语义，另存样本算分位数 */
export function histogram(name, buckets = DEFAULT_BUCKETS) {
  const m = getMetric(name, "histogram");
  m.buckets = buckets;
  return {
    observe(value, labels = {}) {
      const k = seriesKey(labels);
      const s =
        m.series.get(k) ||
        { labels, count: 0, sum: 0, cumulative: buckets.map(() => 0), samples: [] };
      s.count++;
      s.sum += value;
      for (let i = 0; i < buckets.length; i++) if (value <= buckets[i]) s.cumulative[i]++;
      // 环形留存最近 N 条原始观测（dashboard 分位数；导出用累积桶）
      s.samples.push(value);
      if (s.samples.length > SAMPLES_PER_SERIES) s.samples.shift();
      m.series.set(k, s);
    },
  };
}

function quantilesOf(samples) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const r = (v) => Math.round(v * 1000) / 1000;
  return { p50: r(q(0.5)), p95: r(q(0.95)), p99: r(q(0.99)) };
}

/** 结构化快照 —— 监控看板 / 告警引擎取数用 */
export function metricsSnapshot() {
  return [..._registry.values()].map((m) => ({
    name: m.name,
    kind: m.kind,
    series: [...m.series.values()].map((s) =>
      m.kind === "histogram"
        ? { labels: s.labels, count: s.count, sum: Math.round(s.sum * 1000) / 1000, quantiles: quantilesOf(s.samples) }
        : { labels: s.labels, value: s.value }
    ),
  }));
}

/** Prometheus 文本格式（v0.0.4）—— /api/metrics 导出 */
export function prometheusText() {
  const lines = [];
  for (const m of _registry.values()) {
    lines.push(`# TYPE ${m.name} ${m.kind}`);
    for (const s of m.series.values()) {
      const ls = labelStr(s.labels);
      if (m.kind === "histogram") {
        const buckets = m.buckets;
        for (let i = 0; i < buckets.length; i++) {
          const le = String(buckets[i]);
          lines.push(`${m.name}_bucket${mergeLabel(ls, `le="${le}"`)} ${s.cumulative[i]}`);
        }
        lines.push(`${m.name}_bucket${mergeLabel(ls, 'le="+Inf"')} ${s.count}`);
        lines.push(`${m.name}_sum${ls} ${s.sum}`);
        lines.push(`${m.name}_count${ls} ${s.count}`);
      } else {
        lines.push(`${m.name}${ls} ${s.value}`);
      }
    }
  }
  return lines.join("\n") + "\n";
}

/** 把 le 标签并入已有 label 段（桶导出专用） */
function mergeLabel(labelSegment, extra) {
  const inner = labelSegment ? labelSegment.slice(1, -1) + "," : "";
  return "{" + inner + extra + "}";
}
