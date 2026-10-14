/**
 * ai/recovery — 弃购召回营销闭环（Phase 6 独立模块）
 *
 * 为什么从 recommender 拆出：营销调度的启动入口是 instrumentation（会被编译到
 * Edge 入口），而 recommender 热路径依赖 cache.js（ioredis）—— 拆分后本模块
 * 依赖图只含 纯数据/db/llm/notification，Edge 编译安全。AI 营销与 AI 推荐
 * 的演进节奏也不同（频控/合规 vs 召回/排序），独立模块边界即部署边界。
 *
 * 闭环：事件流消费 → 弃购人群 → LLM 文案 → 频控三闸 → Provider 投递 → 审计回流
 * 防骚扰是合规硬要求（方案文档 §7.4 消费者保护）：冷却 / 终身上限 / 全局日上限。
 */

import { PRODUCTS } from "@/data/products";
import { trackEvent, store } from "@/lib/db";
import { callLLM, llmEnabled } from "@/lib/llm";
import { sendEmail, canSend, recordSend, resolveAddress, noteEmailResult, notificationStats } from "@/modules/notification/service";

/**
 * 弃购召回人群（Phase 5 起，自 recommender 迁入）：
 *   有加购、超窗未下单、购物车仍非空 → LLM 个性化文案（模板兜底）→ 待发名单
 * GDPR：名单按需实时计算，erase 后 cart/events 均清，会话自然出列。
 */
export async function abandonedCartHook({ windowMin = 30, max = 20 } = {}) {
  // 1) 事件流消费：加购会话 + 最后活跃时间
  // 注意：不排除"下过单"的会话 —— 复购老客（DTC 60% 收入来源，方案文档 §8.1）
  // 放弃*新*购物车同样要召回；已结算的购物车因下单清空自然出列（非空检查）。
  const cartSids = new Set();
  const lastActivity = new Map();
  for (const e of store("events")) {
    const sid = e.payload?.sessionId;
    if (!sid) continue;
    if (e.type === "cart_added") {
      cartSids.add(sid);
      lastActivity.set(sid, e.ts);
    }
  }

  // 2) 弃购判定：加购 + 超窗未转化 + 购物车仍非空（已结算/已删除的不追）
  const cutoff = Date.now() - windowMin * 60_000;
  const carts = store("carts");
  const abandoned = [];
  for (const sid of cartSids) {
    const cart = carts.get(sid);
    if (!cart?.items?.length) continue;
    const lastAt = lastActivity.get(sid);
    if (new Date(lastAt).getTime() > cutoff) continue; // 仍在活跃决策窗口内 —— 别打扰
    abandoned.push({ sessionId: sid, cart, lastAt });
  }
  abandoned.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));

  // 3) 生成个性化召回文案（LLM → 模板兜底）
  const sessions = await Promise.all(
    abandoned.slice(0, max).map(async ({ sessionId, cart, lastAt }) => ({
      sessionId,
      items: cart.items,
      lastAt,
      message: await recoveryCopy(cart.items),
      channel: "email", // 投递由 dispatchAbandonedCarts() 执行（频控 + Provider + 审计）
    }))
  );
  return { enabled: true, windowMin, count: abandoned.length, sessions };
}

/**
 * 投递编排（Phase 6：营销闭环最后一公里）：
 *   人群 → 地址解析(订阅/复购) → 频控三闸 → Provider 投递 → 账本+指标+事件审计
 * 结果事件 marketing_email_sent 只审计 sent/failed（suppressed 只进指标，
 * 防刷爆事件缓冲）。
 */
export async function dispatchAbandonedCarts({ windowMin = 30, max = 20 } = {}) {
  const audience = await abandonedCartHook({ windowMin, max });
  const counts = { audience: audience.count, sent: 0, failed: 0, suppressed_no_address: 0, suppressed_cooldown: 0, suppressed_session_cap: 0, suppressed_daily_cap: 0 };
  const results = [];

  for (const s of audience.sessions) {
    const addr = resolveAddress(s.sessionId);
    if (!addr) {
      counts.suppressed_no_address++;
      noteEmailResult("suppressed_no_address");
      results.push({ sessionId: s.sessionId, result: "suppressed_no_address" });
      continue;
    }
    const gate = canSend(s.sessionId);
    if (!gate.ok) {
      counts[gate.reason]++;
      noteEmailResult(gate.reason);
      results.push({ sessionId: s.sessionId, result: gate.reason });
      continue;
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://solfit.example";
    const text = `${s.message}\n\nFinish your order in one tap: ${siteUrl}/cart`;
    try {
      const { provider } = await sendEmail({
        to: addr.email,
        subject: "Your SOLFIT picks are still waiting",
        text,
        sessionId: s.sessionId,
        campaign: "abandoned_cart_v1",
      });
      recordSend(s.sessionId, "abandoned_cart_v1");
      counts.sent++;
      noteEmailResult("sent");
      results.push({ sessionId: s.sessionId, result: "sent", source: addr.source, provider });
      trackEvent("marketing_email_sent", { sessionId: s.sessionId, campaign: "abandoned_cart_v1", result: "sent", provider, source: addr.source });
    } catch (err) {
      counts.failed++;
      noteEmailResult("failed");
      results.push({ sessionId: s.sessionId, result: "failed" });
      trackEvent("marketing_email_sent", { sessionId: s.sessionId, campaign: "abandoned_cart_v1", result: "failed", provider: "unknown", source: addr.source });
    }
  }
  return { dispatched: true, windowMin, counts, results, stats: notificationStats() };
}

/**
 * 定时投递器 —— instrumentation.register() 启动（默认 5min 周期）。
 * RECOVERY_DISPATCH_INTERVAL_MS=0 可禁用（如压测环境）。
 */
export function startRecoveryDispatcher() {
  const interval = Number(process.env.RECOVERY_DISPATCH_INTERVAL_MS) || 5 * 60_000;
  if (interval <= 0) return null;
  const timer = setInterval(async () => {
    try {
      const r = await dispatchAbandonedCarts();
      if (r.counts.sent || r.counts.failed) console.log(`[recovery] sent=${r.counts.sent} failed=${r.counts.failed}`);
    } catch (err) {
      console.error("[recovery] dispatch failed:", err.message); // 单轮失败不停止下一轮
    }
  }, interval);
  timer.unref?.(); // 不阻止进程退出（build/静态导出安全）
  console.log(`[recovery] dispatcher started (${Math.round(interval / 1000)}s interval)`);
  return timer;
}

/** 召回文案 —— LLM 个性化（商品事实来自目录数据，防幻觉），LLM 不可用/失败走模板 */
async function recoveryCopy(items) {
  const names = items.slice(0, 3).map((i) => PRODUCTS.find((p) => p.id === i.productId)?.name).filter(Boolean);
  if (!names.length) return null;

  if (llmEnabled) {
    try {
      const res = await callLLM({
        messages: [
          {
            role: "system",
            content:
              "You write abandoned-cart recovery emails for SOLFIT, a premium footwear brand with a free size-exchange guarantee. One short paragraph, warm and concrete. Never invent prices or product facts beyond the given names.",
          },
          { role: "user", content: "Cart items: " + names.join(", ") },
        ],
        maxTokens: 160,
        temperature: 0.6,
      });
      const text = res?.message?.content?.trim();
      if (text) return text;
    } catch { /* LLM 失败 → 模板兜底（AI 绝不阻塞业务） */ }
  }
  return `Still thinking it over? Your ${names[0]} is waiting — and with our free size-exchange guarantee, the only risk is missing out.`;
}
