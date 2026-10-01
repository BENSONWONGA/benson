import { NextResponse } from "next/server";
import { askStylist } from "@/ai/stylist";

/**
 * POST /api/ai/stylist
 * body: {message, history[{role, content}]}
 * resp: {code, data: {reply, products[], source: "llm"|"rules"|"rules-fallback"}}
 * 防幻觉契约：products 只来自结构化检索（tools.js），LLM 不产出商品事实
 */
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body?.message) {
    return NextResponse.json({ code: 400, message: "message is required" }, { status: 400 });
  }
  const result = await askStylist(body.message, Array.isArray(body.history) ? body.history : []);
  return NextResponse.json({ code: 0, data: result });
}
