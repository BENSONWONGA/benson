import { NextResponse } from "next/server";
import { abandonedCartHook, dispatchAbandonedCarts } from "@/ai/recovery";
import { observed } from "@/lib/observe";

/**
 * GET  /api/ai/abandoned-carts — 弃购名单预览（Phase 5；windowMin 默认 30，0 = 立即判定）
 * POST /api/ai/abandoned-carts — 触发一轮投递（Phase 6：人群 → 频控 → Provider → 审计）
 *   body: {windowMin?, max?}   响应含逐会话 result 与 summary stats
 *
 * TODO(上生产): 内部运营端点必须挂内部认证（与 /api/monitoring 同批）。
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  return observed("abandoned-carts", async () => {
    const sp = request.nextUrl.searchParams;
    const num = (key, def) => {
      const raw = sp.get(key);
      return raw !== null && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : def;
    };
    const data = await abandonedCartHook({
      windowMin: num("windowMin", 30), // 0 是合法值（立即判定），不能用 || 兜底
      max: num("max", 20),
    });
    return NextResponse.json({ code: 0, data });
  });
}

export async function POST(request) {
  return observed("abandoned-carts", async () => {
    const body = await request.json().catch(() => ({}));
    const num = (key, def) => {
      const v = body?.[key];
      return v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : def;
    };
    const data = await dispatchAbandonedCarts({ windowMin: num("windowMin", 30), max: num("max", 20) });
    return NextResponse.json({ code: 0, data });
  });
}
