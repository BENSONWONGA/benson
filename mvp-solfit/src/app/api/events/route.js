import { NextResponse } from "next/server";
import { getSessionId, trackEvent } from "@/lib/db";
import { EVENT_SCHEMA } from "@/lib/pipeline";
import { observed } from "@/lib/observe";

/**
 * POST /api/events — 客户端埋点接收（方案文档 §7.3）
 * GDPR：analytics 类事件由客户端在取得同意后才上报（lib/track.js 已过滤）；
 * 服务端在本路由不再做二次判断 —— 信任客户端过滤 + 事件名白名单校验。
 * Phase 4：白名单来自 EVENT_SCHEMA（pipeline 单一事实源）；
 *          落管道后再过一遍 schema（deny-by-default PII 治理）。
 */

const ALLOWED = new Set(Object.keys(EVENT_SCHEMA));

export async function POST(request) {
  return observed("events", async () => {
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
  });
}

/** 客户端输入防护：只放行标量 + 截断字段数（纵深防御，管道层仍有 schema） */
function sanitize(props) {
  if (!props || typeof props !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(props).slice(0, 12)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}
