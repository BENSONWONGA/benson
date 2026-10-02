/**
 * lib/pipeline.js — 统一事件管道（Phase 4：数据闭环基建，方案文档 §7.3）
 *
 * 所有埋点（客户端 sendBeacon → /api/events 与服务端 trackEvent）的唯一入口：
 *   emit(type, payload)
 *     1) EVENT_SCHEMA 校验（deny-by-default：未声明字段拦截 + 类型校验）
 *     2) 派生指标（solfit_events_total —— 埋点系统自身也被监控）
 *     3) 分发到已注册 sink：
 *        - memory-buffer : 业务缓冲（db.js 注册，analytics/推荐特征读这里）
 *        - kafka         : KAFKA_BROKERS 配置且 kafkajs 可用时启用（数仓燃料）
 *
 * GDPR：schema 即 PII 治理点 —— 用户输入（如导购对话原文）不声明进 schema，
 * 自然被剥离出管道；指标 label 只含事件类型等枚举值。
 *
 * 演进：Phase 5 接 Kafka Streams/Flink 做窗口聚合时，本文件仍是唯一入口。
 */

import { counter } from "@/lib/metrics";

/**
 * 事件规范（单一事实来源 —— /api/events 白名单与服务端 trackEvent 共用）
 * value 为字段类型（"string"|"number"|"boolean"|"object"）；字段 null/undefined 放行（可选语义）。
 */
export const EVENT_SCHEMA = {
  // ===== 漏斗核心（客户端 + 服务端）=====
  product_viewed: { productId: "number", category: "string", sessionId: "string" },
  cart_added: { sessionId: "string", productId: "number", size: "string", width: "string", qty: "number", action: "string" },
  cart_updated: { sessionId: "string", action: "string" },
  checkout_started: { sessionId: "string", currency: "string" },
  order_created: { orderId: "string", sessionId: "string", region: "string", total: "number", currency: "string", itemCount: "number", taxType: "string", provider: "string" },
  order_paid: { orderId: "string", total: "number", currency: "string", provider: "string" },
  order_payment_failed: { orderId: "string", provider: "string" },
  order_exchanged: { orderId: "string", sessionId: "string", productId: "number", fromSize: "string", toSize: "string", reason: "string" },
  // ===== AI 服务 =====
  ai_size_recommended: { profile: "object", size: "string", width: "string", confidence: "number" },
  ai_stylist_message: {}, // 用户消息原文是 PII —— 只计数，字段不落管道
  recommend_served: { type: "string", sessionId: "string", seedId: "number", variant: "string" },
  // ===== 档案与合规 =====
  fit_profile_saved: { sessionId: "string", recommended: "string" },
  profile_erased: { sessionId: "string", scope: "string" },
  // ===== 目录与 RUM（Core Web Vitals，客户端 useReportWebVitals）=====
  catalog_list_viewed: { query: "object" },
  product_api_fetched: { productId: "number" },
  web_vitals: { name: "string", value: "number", rating: "string", metricId: "string" },
};

const eventsTotal = counter("solfit_events_total");
const discardedTotal = counter("solfit_events_discarded_total");
const sinkErrorsTotal = counter("solfit_pipeline_sink_errors_total");

/** 管道运行统计（看板与告警取数） */
const _stats = { emitted: 0, accepted: 0, discarded: 0, lastEmittedAt: null };
const _sinks = []; // { id, fn }

export function registerSink(id, fn) {
  if (_sinks.some((s) => s.id === id)) return; // 幂等（HMR/多模块实例防护）
  _sinks.push({ id, fn });
}

/** 管道丢弃计数（overflow 由缓冲 sink 调用；schema 丢弃在 emit 内部调用） */
export function noteDiscarded(reason, n = 1) {
  _stats.discarded += n;
  discardedTotal.inc(n, { reason });
}

/**
 * 事件发射 —— trackEvent 与 /api/events 的统一底层
 * @returns {boolean} 是否被管道接受（未知事件名 => false）
 */
export function emit(type, payload = {}) {
  _stats.emitted++;
  _stats.lastEmittedAt = new Date().toISOString();

  const schema = EVENT_SCHEMA[type];
  if (!schema) {
    noteDiscarded("unknown_event");
    return false;
  }

  // deny-by-default：只保留 schema 声明且类型匹配的字段
  const clean = {};
  let bad = 0;
  for (const [k, v] of Object.entries(payload || {})) {
    const decl = schema[k];
    if (!decl) { bad++; continue; } // 未声明字段 —— 拦截（PII/脏数据治理点）
    if (v === null || v === undefined) { clean[k] = v; continue; } // 可选字段显式置空
    if (typeof v !== decl) { bad++; continue; } // 类型不匹配 —— 剥离该字段
    clean[k] = v;
  }
  if (bad) noteDiscarded("schema", bad);

  _stats.accepted++;
  eventsTotal.inc(1, { type });

  const event = { type, payload: clean, ts: _stats.lastEmittedAt };
  for (const sink of _sinks) {
    try {
      sink.fn(event);
    } catch {
      sinkErrorsTotal.inc(1, { sink: sink.id }); // sink 故障不阻塞事件流
    }
  }
  return true;
}

// ===== Kafka sink（数仓事件流，方案文档 §7.3）=====
// KAFKA_BROKERS 未配置或 kafkajs 未安装时自动禁用 —— 与 cache.js 的 Redis 策略一致。
let _producer = null;
let _kafkaState = "disabled"; // disabled | ready | failed

async function ensureKafkaProducer() {
  if (!process.env.KAFKA_BROKERS) return null;
  if (_kafkaState === "ready") return _producer;
  if (_kafkaState === "failed") return null;
  try {
    // webpackIgnore：kafkajs 不在依赖里时不参与打包，运行时缺失则降级
    const { Kafka } = require(/* webpackIgnore: true */ "kafkajs");
    const kafka = new Kafka({ clientId: "solfit-api", brokers: process.env.KAFKA_BROKERS.split(",") });
    _producer = kafka.producer();
    await _producer.connect();
    _kafkaState = "ready";
    return _producer;
  } catch {
    _kafkaState = "failed"; // 连不上/没装 kafkajs —— 静默降级为内存缓冲
    return null;
  }
}

if (process.env.KAFKA_BROKERS) {
  registerSink("kafka", (event) => {
    // fire-and-forget：Kafka 抖动绝不阻塞业务请求
    ensureKafkaProducer()
      .then((p) =>
        p &&
        p.send({
          topic: process.env.KAFKA_TOPIC || "solfit.events",
          messages: [{ value: JSON.stringify(event) }],
        })
      )
      .catch(() => sinkErrorsTotal.inc(1, { sink: "kafka" }));
  });
}

/** 管道健康快照（/api/health 与监控看板） */
export function pipelineStats() {
  return {
    ..._stats,
    schemaEvents: Object.keys(EVENT_SCHEMA).length,
    sinks: _sinks.map((s) => s.id),
    kafka: process.env.KAFKA_BROKERS ? _kafkaState : "not_configured",
  };
}
