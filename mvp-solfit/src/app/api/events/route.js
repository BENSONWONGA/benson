import { NextResponse } from "next/server";
import { getSessionId, trackEvent } from "@/lib/db";

/**
 * POST /api/events — 客户端埋点接收（方案文档 §7.3）
 * GDPR：analytics 类事件由客户端在取得同意后才上报（lib/track.js 已过滤）；
 * 服务端在本路由不再做二次判断 —— 信任客户端过滤 + 事件名白名单校验。
 * TODO(Phase 2): 本路由替换为 Kafka producer，analytics 侧由流处理消费。
 */

// 事件名白名单（与 lib/track.js / lib/db.trackEvent 服务端事件共用一套 snake_case 规范）
const ALLOWED = new Set([
  "product_viewed",
  "cart_added",
  "cart_updated",
  "checkout_started",
  "order_created",
  "order_exchanged",
  "fit_profile_saved",
  "profile_erased",
  "ai_size_recommended",
  "ai_stylist_message",
  "recommend_served",
]);

export async function POST(request) {
  const sessionId = getSessionId();
  const body = await request.json().catch(() => null);
  const events = Array.isArray(body?.events) ? body.events : [];

  let accepted = 0;
  for (const e of events.slice(0, 20)) {
    if (!e?.name || !ALLOWED.has(e.name)) continue;
    trackEvent(e.name, { ...sanitize(e.props), sessionId });
    accepted++;
  }
  return NextResponse.json({ code: 0, data: { accepted } });
}

function sanitize(props) {
  if (!props || typeof props !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(props).slice(0, 12)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}
