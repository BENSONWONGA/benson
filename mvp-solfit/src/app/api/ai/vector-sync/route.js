import { NextResponse } from "next/server";
import { syncProductVectors, vectorStoreState } from "@/ai/recommender/vector-store";
import { observed } from "@/lib/observe";

/**
 * GET  /api/ai/vector-sync — 检索面状态（driver/mode/维度/同步时间/最近错误）
 * POST /api/ai/vector-sync — 强制重刷商品向量（Phase 14）
 *   ?force=1 绕过进程内 once 标志全量 upsert —— 目录/商品属性变更后调用；
 *   向量为确定性派生（FNV-1a），upsert 幂等，重复调用无副作用。
 *
 * 与离线口径（npm run db:vector-sync）写同一张 product_vectors 表 ——
 * 运行时端点省去运维登机流程；两者都要求 DATABASE_URL 已配置，
 * 否则返回 degraded（推荐不受影响：召回层自动走内存全量扫）。
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  return observed("ai-vector-sync", async () => {
    return NextResponse.json({ code: 0, data: vectorStoreState() });
  });
}

export async function POST(request) {
  return observed("ai-vector-sync", async () => {
    const force = request.nextUrl.searchParams.get("force") === "1";
    const result = await syncProductVectors({ force });
    if (!result.synced) {
      return NextResponse.json(
        { code: 503, message: result.error || "vector store degraded (DATABASE_URL not configured)", data: vectorStoreState() },
        { status: 503 }
      );
    }
    return NextResponse.json({ code: 0, data: { ...result, state: vectorStoreState() } });
  });
}
