import { NextResponse } from "next/server";
import { getSessionId, store, trackEvent } from "@/lib/db";
import { deleteProfile } from "@/modules/customer/service";

/**
 * GDPR 被遗忘权 — POST /api/privacy/erase
 * 删除本会话全部个人数据：脚型档案 / 购物车 / 会话关联事件。
 * 订单保留金额与状态（财务合规要求），仅抹除 sessionId 关联。
 * 前端 erase 后同时清 localStorage（solfit_fit_profile 等）。
 */
export async function POST(request) {
  const sessionId = getSessionId();
  const removed = {
    fitProfile: deleteProfile(sessionId) ? 1 : 0,
    cart: store("carts").delete(sessionId) ? 1 : 0,
    events: 0,
  };

  // 抹除事件流中该会话的个人关联事件（骨架内存版；Phase 2 由数仓按 session 幂等删除）
  const events = store("events");
  let i = events.length;
  while (i--) {
    if (events[i].payload?.sessionId === sessionId) { events.splice(i, 1); removed.events++; }
  }

  // 订单脱关联（保留财务记录）
  for (const o of store("orders").values()) {
    if (o.sessionId === sessionId) { o.sessionId = null; o.email = null; store("orders").set(o.id, o); }
  }

  trackEvent("profile_erased", { sessionId: null, scope: "erased" }); // 匿名计数
  return NextResponse.json({ code: 0, data: removed });
}
