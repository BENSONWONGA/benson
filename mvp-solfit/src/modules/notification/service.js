/**
 * modules/notification — 通知域（模块化单体 · 业务域 5/5，Phase 6 新增）
 * 职责：营销/事务邮件投递 —— Provider 适配、地址解析、频控账本（防骚扰）。
 *
 * 设计（与 lib/llm.js、modules/payment 同款策略，零依赖开箱可跑）：
 *   - Provider 可插拔：EMAIL_PROVIDER=stub（写进程内发件箱，测试/骨架用）
 *     | sendgrid（fetch 直调 v3 API，无需 SDK）。Phase 7 加 SES 时的接入点也在这层。
 *   - 地址解析：显式订阅（subscribe API）优先，其次复购会话的历史订单邮箱。
 *   - 频控防骚扰（方案文档 §7.3 营销回流 + 合规要求）：
 *       会话冷却（默认 3 天）/ 会话终身上限（默认 3 封）/ 全局日发量上限（默认 50，
 *       保护发信域名信誉）。三个阈值全部环境变量可调。
 *
 * GDPR：订阅与账本按 sessionId 关联，purgeSessionData 供隐私删除调用；
 * 发件箱（stub 投递件）含收件人地址，一并清除。
 */

import { store } from "@/lib/db";
import { counter, gauge } from "@/lib/metrics";

const PROVIDER = process.env.EMAIL_PROVIDER === "sendgrid" && process.env.SENDGRID_API_KEY ? "sendgrid" : "stub";
const FROM = process.env.EMAIL_FROM || "care@solfit.example";

// 频控阈值（env 可调 —— 测试与运营调参）
const COOLDOWN_MS = Number(process.env.RECOVERY_COOLDOWN_MS) || 3 * 24 * 60 * 60_000;
const MAX_PER_SESSION = Number(process.env.RECOVERY_MAX_PER_SESSION) || 3;
const DAILY_CAP = Number(process.env.RECOVERY_DAILY_CAP) || 50;

const emailsTotal = counter("solfit_marketing_emails_total"); // label: { result }
const outboxGauge = gauge("solfit_marketing_outbox_depth");

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** 订阅（subscribe API / 退订传 null）—— 显式同意，营销发送的唯一合规前提 */
export function subscribe(sessionId, email) {
  const subs = store("emailSubscribers");
  if (email === null) {
    const existed = subs.delete(sessionId);
    return { subscribed: !existed };
  }
  const clean = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) throw new Error("INVALID_EMAIL");
  subs.set(sessionId, { email: clean, subscribedAt: new Date().toISOString() });
  return { subscribed: true, email: mask(clean) };
}

export function getSubscription(sessionId) {
  const sub = store("emailSubscribers").get(sessionId);
  return sub ? { subscribed: true, email: mask(sub.email), subscribedAt: sub.subscribedAt } : { subscribed: false };
}

/**
 * 地址解析 —— 弃购会话多半没留邮箱，按可信度降级：
 *   1) 显式订阅（用户主动同意，最高优先）
 *   2) 本会话历史订单邮箱（复购访客 —— 真实 DTC 里弃购召回最大的地址来源）
 */
export function resolveAddress(sessionId) {
  const sub = store("emailSubscribers").get(sessionId);
  if (sub?.email) return { email: sub.email, source: "subscribed" };
  for (const o of store("orders").values()) {
    if (o.sessionId === sessionId && o.email) return { email: o.email, source: "past_order" };
  }
  return null;
}

function startOfToday(now = Date.now()) {
  const d = new Date(now);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();
}

function sendsToday(now) {
  const midnight = startOfToday(now);
  let n = 0;
  for (const entry of store("emailLedger").values()) {
    for (const s of entry.sends) if (new Date(s.at).getTime() >= midnight) n++;
  }
  return n;
}

/**
 * 频控判定 —— 三道闸（顺序：冷却 → 终身上限 → 全局日上限）
 * @returns {{ok: true} | {ok: false, reason: "suppressed_cooldown"|"suppressed_session_cap"|"suppressed_daily_cap"}}
 */
export function canSend(sessionId, now = Date.now()) {
  const entry = store("emailLedger").get(sessionId);
  if (entry) {
    if (entry.sends.length >= MAX_PER_SESSION) return { ok: false, reason: "suppressed_session_cap" };
    if (now - entry.lastSentAt < COOLDOWN_MS) return { ok: false, reason: "suppressed_cooldown" };
  }
  if (sendsToday(now) >= DAILY_CAP) return { ok: false, reason: "suppressed_daily_cap" };
  return { ok: true };
}

/** 发送成功后记账（频控与审计的唯一事实来源） */
export function recordSend(sessionId, campaign, now = Date.now()) {
  const ledger = store("emailLedger");
  const entry = ledger.get(sessionId) || { sends: [], lastSentAt: 0 };
  entry.sends.push({ campaign, at: new Date(now).toISOString() });
  entry.lastSentAt = now;
  ledger.set(sessionId, entry);
}

/**
 * 邮件投递 —— Provider 分发
 * stub：写进程内发件箱 + 日志（骨架开箱可跑，e2e 可断言）
 * sendgrid：fetch 直调 v3（20s 硬超时；失败上抛由调用方降级计数）
 */
export async function sendEmail({ to, subject, text, sessionId, campaign }) {
  if (PROVIDER === "sendgrid") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SENDGRID_API_KEY}` },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: FROM },
          subject,
          content: [{ type: "text/plain", value: text }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`sendgrid ${res.status}: ${await res.text()}`);
      return { provider: "sendgrid" };
    } finally {
      clearTimeout(timer);
    }
  }

  // stub：模拟投递 —— 发件箱保留最近 200 封（含 sessionId 供 GDPR 清除）
  const outbox = store("outbox");
  outbox.push({ to, subject, text, sessionId, campaign, at: new Date().toISOString() });
  while (outbox.length > 200) outbox.shift();
  outboxGauge.set(outbox.length);
  console.log(`[email:stub] → ${mask(to)} "${subject}" (${campaign})`);
  return { provider: "stub" };
}

/** GDPR 清除 —— 隐私删除调用（订阅/账本/发件箱三清） */
export function purgeSessionData(sessionId) {
  const removed = {
    subscriber: store("emailSubscribers").delete(sessionId) ? 1 : 0,
    ledger: store("emailLedger").delete(sessionId) ? 1 : 0,
    outbox: 0,
  };
  const outbox = store("outbox");
  let i = outbox.length;
  while (i--) {
    if (outbox[i].sessionId === sessionId) { outbox.splice(i, 1); removed.outbox++; }
  }
  outboxGauge.set(outbox.length);
  return removed;
}

/** 营销数据导出 —— 隐私可携带权（邮箱脱敏展示，与订单导出口径一致） */
export function exportSessionData(sessionId) {
  return {
    subscription: getSubscription(sessionId),
    sends: store("emailLedger").get(sessionId)?.sends ?? [],
  };
}

/** 域健康快照 —— 监控看板 */
export function notificationStats() {
  return {
    provider: PROVIDER,
    outboxDepth: store("outbox").length,
    subscribers: store("emailSubscribers").size,
    ledgerSessions: store("emailLedger").size,
    sendsToday: sendsToday(),
    limits: { cooldownMs: COOLDOWN_MS, maxPerSession: MAX_PER_SESSION, dailyCap: DAILY_CAP },
  };
}

/** 邮件结果计数（编排层逐结果打点） */
export function noteEmailResult(result) {
  emailsTotal.inc(1, { result });
}

function mask(email) {
  if (!email) return null;
  const [name, domain] = email.split("@");
  return name?.slice(0, 2) + "***@" + domain;
}
