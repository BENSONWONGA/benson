import { NextResponse } from "next/server";
import { getSessionId, store } from "@/lib/db";

/**
 * GDPR 数据可携带权 — GET /api/privacy/export
 * 导出本会话关联的全部个人数据（购物车 / 脚型档案 / 订单）。
 * TODO(Phase 2): 账户体系上线后按 userId 全量导出 + 邮件交付
 */
export async function GET(request) {
  const sessionId = getSessionId();
  const orders = [...store("orders").values()].filter((o) => o.sessionId === sessionId)
    .map((o) => ({ ...o, email: mask(o.email) })); // 骨架期脱敏展示
  return NextResponse.json({
    code: 0,
    data: {
      sessionId,
      cart: store("carts").get(sessionId) || { items: [] },
      fitProfile: store("fitProfiles").get(sessionId) || null,
      orders,
      generatedAt: new Date().toISOString(),
    },
  });
}

function mask(email) {
  if (!email) return null;
  const [name, domain] = email.split("@");
  return name?.slice(0, 2) + "***@" + domain;
}
