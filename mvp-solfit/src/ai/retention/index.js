/**
 * ai/retention — 复购与留存推荐（Phase 7 独立模块）
 *
 * 为什么独立于 recommender：与 ai/recovery 同理 —— 留存调度入口在
 * instrumentation（Edge 编译），依赖图必须避开 cache.js（ioredis）。
 * 且留存推荐与站内推荐的候选逻辑相反（站内：排除已购；留存：以已购为锚），
 * 强行复用会把两种语义搅在一起。
 *
 * 闭环：RFM 分层 → 场景决策（补货到期/搭配互补/挽回）→ 候选生成 →
 *       LLM 文案（模板兜底）→ 频控投递（复用 Phase 6 notification 域）→ 审计回流
 *
 * 频控共享是特性不是 bug：弃购召回与留存摘要是同一频控账本（单客冷却 3 天、
 * 终身上限、全局日上限）—— 对客户而言只有"这个品牌多久烦我一次"，
 * 不存在"哪个campaign烦我"，防骚扰以人为单位（方案文档 §7.4）。
 *
 * 演进：Phase 8+ 接 CDP/会员积分体系时，分层与场景在此替换为特征平台查询，
 *       dispatch 签名不变。
 */

import { store, trackEvent } from "@/lib/db";
import { callLLM, llmEnabled } from "@/lib/llm";
import { segmentCustomers } from "./rfm";
import { pickScenario, scenarioCandidates } from "./scenarios";
import {
  sendEmail,
  canSend,
  recordSend,
  resolveAddress,
  noteEmailResult,
  notificationStats,
} from "@/modules/notification/service";

const CAMPAIGN = "retention_digest_v1";

/** 每场景一封邮件只讲一件事 —— 文案基调由场景决定（模板兜底同口径） */
const SCENARIO_VOICE = {
  repurchase_due: "a replacement reminder: cushioning fades with wear, their new pair should arrive before the old one gives out",
  complete_the_look: "a wardrobe-rotation suggestion: one complementary style that fills the gap in what they already own",
  win_back: "a warm win-back note: their size profile is still saved, new arrivals have landed since they last visited",
};

/**
 * 留存摘要构建（预览与投递共用）：
 *   RFM 分层 → 场景决策 → 3 个候选 → LLM 个性化文案（模板兜底）
 * @param {{max?: number, tier?: string}} opts tier 过滤运营预览用
 */
export async function buildRetentionDigests({ max = 20, tier } = {}) {
  const { customers, tiers, total } = segmentCustomers();
  const pool = tier ? customers.filter((c) => c.tier === tier) : customers;

  const digests = [];
  const scenarioHits = {};
  for (const c of pool.slice(0, max)) {
    const decision = pickScenario(c);
    const items = scenarioCandidates(c, decision);
    if (!items.length) continue; // 全目录已购（10 SKU 骨架期的极端情况）—— 没有诚实的推荐就不发
    scenarioHits[decision.scenario] = (scenarioHits[decision.scenario] || 0) + 1;
    digests.push({
      sessionId: c.sessionId,
      tier: c.tier,
      isNew: c.isNew,
      rfm: { recencyDays: c.rfm.recencyDays, frequency: c.rfm.frequency, monetary: c.rfm.monetary },
      scenario: decision.scenario,
      dueCategory: decision.dueCategory || null,
      monthsSince: decision.monthsSince || null,
      items,
      message: await digestCopy(c, decision, items),
      channel: "email", // 投递由 dispatchRetentionDigests() 执行（频控 + Provider + 审计）
    });
  }
  return { enabled: true, campaign: CAMPAIGN, totalCustomers: total, tiers, scenarioHits, count: digests.length, digests };
}

/**
 * 投递编排 —— 与 Phase 6 dispatchAbandonedCarts 同构：
 *   地址解析（订阅/复购订单）→ 频控三闸 → Provider 投递 → 账本+指标+事件审计
 * 只审计 sent/failed（suppressed 只进指标）。
 */
export async function dispatchRetentionDigests({ max = 20, tier } = {}) {
  const audience = await buildRetentionDigests({ max, tier });
  const counts = {
    audience: audience.count,
    sent: 0,
    failed: 0,
    suppressed_no_address: 0,
    suppressed_cooldown: 0,
    suppressed_session_cap: 0,
    suppressed_daily_cap: 0,
  };
  const results = [];

  for (const d of audience.digests) {
    const addr = resolveAddress(d.sessionId);
    if (!addr) {
      counts.suppressed_no_address++;
      noteEmailResult("suppressed_no_address");
      results.push({ sessionId: d.sessionId, scenario: d.scenario, result: "suppressed_no_address" });
      continue;
    }
    const gate = canSend(d.sessionId);
    if (!gate.ok) {
      counts[gate.reason]++;
      noteEmailResult(gate.reason);
      results.push({ sessionId: d.sessionId, scenario: d.scenario, result: gate.reason });
      continue;
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://solfit.example";
    const lines = d.items.map((i) => `- ${i.name} — ${i.why}`);
    const text = `${d.message}\n\n${lines.join("\n")}\n\nYour saved size profile, one tap away: ${siteUrl}/shop`;
    try {
      const { provider } = await sendEmail({
        to: addr.email,
        subject: subjectFor(d),
        text,
        sessionId: d.sessionId,
        campaign: CAMPAIGN,
      });
      recordSend(d.sessionId, CAMPAIGN);
      counts.sent++;
      noteEmailResult("sent");
      results.push({ sessionId: d.sessionId, scenario: d.scenario, tier: d.tier, result: "sent", source: addr.source, provider });
      trackEvent("marketing_email_sent", { sessionId: d.sessionId, campaign: CAMPAIGN, result: "sent", provider, source: addr.source });
    } catch (err) {
      counts.failed++;
      noteEmailResult("failed");
      results.push({ sessionId: d.sessionId, scenario: d.scenario, result: "failed" });
      trackEvent("marketing_email_sent", { sessionId: d.sessionId, campaign: CAMPAIGN, result: "failed", provider: "unknown", source: addr.source });
    }
  }
  return { dispatched: true, campaign: CAMPAIGN, counts, results, stats: notificationStats() };
}

/**
 * 定时投递器 —— instrumentation.register() 启动。
 * 默认 7 天周期（留存邮件频率远低于弃购召回的 5min 轮询 ——
 * 前者是"可能到期"的弱信号，后者是"确定弃购"的强信号）。
 * RETENTION_DISPATCH_INTERVAL_MS=0 禁用。
 */
export function startRetentionDispatcher() {
  const interval = Number(process.env.RETENTION_DISPATCH_INTERVAL_MS) || 7 * 24 * 60 * 60_000;
  if (interval <= 0) return null;
  const timer = setInterval(async () => {
    try {
      const r = await dispatchRetentionDigests();
      if (r.counts.sent || r.counts.failed) console.log(`[retention] sent=${r.counts.sent} failed=${r.counts.failed}`);
    } catch (err) {
      console.error("[retention] dispatch failed:", err.message); // 单轮失败不停止下一轮
    }
  }, interval);
  timer.unref?.(); // 不阻止进程退出（build/静态导出安全）
  console.log(`[retention] dispatcher started (${Math.round(interval / 60_000)}min interval)`);
  return timer;
}

/** 域健康快照 —— 监控看板（分层分布 + 场景命中 + 调度器状态） */
export function retentionStats() {
  const { customers, tiers, total } = segmentCustomers();
  const scenarioHits = {};
  for (const c of customers) {
    const { scenario } = pickScenario(c);
    scenarioHits[scenario] = (scenarioHits[scenario] || 0) + 1;
  }
  return {
    campaign: CAMPAIGN,
    customers: total,
    tiers,
    scenarioHits,
    dispatcher: {
      intervalMs: Number(process.env.RETENTION_DISPATCH_INTERVAL_MS) || 7 * 24 * 60 * 60_000,
      enabled: (Number(process.env.RETENTION_DISPATCH_INTERVAL_MS) || 7 * 24 * 60 * 60_000) > 0,
    },
  };
}

/**
 * 摘要文案 —— LLM 个性化（商品事实与购买时长来自订单/目录，防幻觉），
 * LLM 不可用/失败走场景化模板（AI 绝不阻塞业务）。
 */
async function digestCopy(customer, decision, items) {
  const names = items.slice(0, 3).map((i) => i.name).filter(Boolean);
  if (!names.length) return null;

  if (llmEnabled) {
    try {
      const res = await callLLM({
        messages: [
          {
            role: "system",
            content:
              "You write one short retention-email paragraph for SOLFIT, a premium footwear brand with a free size-exchange guarantee. Warm, concrete, no pressure. Never invent prices, discounts or product facts beyond the given names.",
          },
          {
            role: "user",
            content: `Customer segment: ${customer.tier}. This email is ${SCENARIO_VOICE[decision.scenario] || "a personalized pick"}. Products: ${names.join(", ")}.`,
          },
        ],
        maxTokens: 160,
        temperature: 0.6,
      });
      const text = res?.message?.content?.trim();
      if (text) return text;
    } catch { /* LLM 失败 → 模板兜底 */ }
  }

  if (decision.scenario === "repurchase_due") {
    return `It's been about ${decision.monthsSince} months since your last ${decision.dueCategory.toLowerCase()} — cushioning quietly fades with wear. ${names[0]} is ready when you are, with free size exchange as always.`;
  }
  if (decision.scenario === "win_back") {
    return `Your size profile is still saved with us — and quite a few new pairs have landed since your last visit. Start with ${names[0]}.`;
  }
  return `Your rotation is missing one move: ${names[0]} pairs cleanly with what you already own. Free size exchange, as always.`;
}

/** 场景化邮件标题（与文案基调一致，避免"Newsletter"式通用标题） */
function subjectFor(d) {
  if (d.scenario === "repurchase_due") return `Time to refresh your ${d.dueCategory.toLowerCase()}?`;
  if (d.scenario === "win_back") return "Your size profile is still here — see what's new";
  if (d.isNew) return "One more pair to complete your first rotation";
  return "One pick to complete your rotation";
}
