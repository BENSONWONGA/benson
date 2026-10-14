import { NextResponse } from "next/server";
import { store } from "@/lib/db";
import { pipelineStats } from "@/lib/pipeline";
import { listProducts } from "@/modules/catalog/service";

/**
 * GET /api/health — 存活/就绪探针（Phase 4）
 * K8s/容器平台探针与 uptime 监控用；无认证（不含敏感信息）。
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const products = listProducts();
  const pipeline = pipelineStats();

  const checks = {
    catalog: { ok: products.length > 0, products: products.length },
    eventsBuffer: { ok: true, depth: store("events").length },
    fitTrainingSet: { ok: true, samples: store("fitTrainingSet").length },
    pipeline: {
      ok: pipeline.discarded < 1000, // 丢弃爆表 = 不健康（告警规则同样盯这个值）
      discarded: pipeline.discarded,
      kafka: pipeline.kafka,
      sinks: pipeline.sinks,
    },
  };
  const healthy = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      code: 0,
      data: {
        status: healthy ? "ok" : "degraded",
        uptimeSec: Math.round(process.uptime()),
        ts: new Date().toISOString(),
        checks,
      },
    },
    { status: healthy ? 200 : 503 }
  );
}
