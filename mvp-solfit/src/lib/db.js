/**
 * lib/db.js — 数据层接入点（当前：进程内存储 + 种子数据）
 *
 * 架构约定：业务域 service 只通过本层读写持久化，不直接持有存储实现。
 * Phase 1 结束后按下面顺序替换为 PostgreSQL，service 签名不变：
 *   1. npm i pg && 把 stores 换成 SQL 实现
 *   2. catalog 加缓存（Redis）
 *   3. 事件流（Kafka/CDC）接埋点与退货数据回流 => AI 训练燃料
 *
 * 跨境注意：GDPR 分区要求欧盟用户数据落欧盟区 —— 预留 region 字段。
 */

import { cookies } from "next/headers";
import { emit, registerSink, noteDiscarded } from "@/lib/pipeline";

// 进程内存储（dev / 骨架演示用；多实例部署时必须替换）
const _stores = {
  carts: new Map(),        // sessionId -> { items: [{productId, size, width, qty}] }
  fitProfiles: new Map(),  // sessionId -> FitProfile（Phase 3 迁移为账户级 + 欧盟分区）
  orders: new Map(),       // orderId -> Order
  inventory: new Map(),     // "productId:size" -> qty（modules/inventory 管理）
  events: [],              // 埋点事件缓冲（Phase 4 起由 pipeline 管理，见 registerSink）
  fitTrainingSet: [],       // 换货/退货训练样本（PG: fit_training_set 表，Phase 2 迁移已建）
  recTrainingSet: [],       // 推荐印象样本（Phase 5：印象特征快照 → 回流标注 → 学习排序）
  emailSubscribers: new Map(), // sessionId -> {email, subscribedAt}（Phase 6 营销订阅，GDPR erase 清除）
  emailLedger: new Map(),     // sessionId -> {sends[], lastSentAt}（Phase 6 频控账本）
  outbox: [],                // stub Provider 投递件（Phase 6；GDPR erase 清除）
};

export function store(name) {
  if (!(name in _stores)) throw new Error("Unknown store: " + name);
  return _stores[name];
}

// 事件管道 sink：内存缓冲 —— analytics 基线 / 推荐特征 / 换货回流从这里读
// （Kafka 等外部 sink 由 pipeline 自行注册；本 sink 保证零依赖开箱可跑）
registerSink("memory-buffer", (event) => {
  const buf = _stores.events;
  buf.push(event);
  if (buf.length > 1000) {
    buf.shift(); // 骨架期防溢出（Phase 5 落数仓后缓冲由 Kafka 承接）
    noteDiscarded("overflow");
  }
});

/**
 * 埋点事件写入 —— AI 闭环的燃料入口（Phase 4 起走统一管道：schema 校验 → 指标 → sinks）
 * 签名不变：调用方（各业务域 service / AI 服务）零改动。
 */
export function trackEvent(type, payload) {
  emit(type, payload);
}

/**
 * 会话 ID：从 cookie 取或生成并回写（httpOnly · lax · 30天）
 * 使用 Next.js cookies() API，在 route handler 内可读可写，无需传 response。
 */
export function getSessionId() {
  const cookieStore = cookies();
  let sid = cookieStore.get("solfit_sid")?.value;
  if (!sid) {
    sid = "s_" + Math.random().toString(36).slice(2, 12);
    cookieStore.set("solfit_sid", sid, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  }
  return sid;
}

/** 只读会话 ID —— SSR 服务器组件安全用（不写 cookie；无会话返回 null，调用方降级冷启动） */
export function peekSessionId() {
  return cookies().get("solfit_sid")?.value || null;
}
