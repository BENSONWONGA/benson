/**
 * instrumentation.js — 服务进程启动钩子（Phase 4）
 * register() 在每个 Next 服务器进程启动时执行一次：
 *   - 启动告警评估器（30s 周期；评估内部另有 60s 节流）
 *   - Kafka sink 等惰性初始化不在此处触发（首次事件时自举）
 *
 * 构建期（NEXT_PHASE=phase-production-build）跳过 —— 不阻塞静态导出。
 */

export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { startEvaluator } = await import("@/lib/alerts");
    startEvaluator();
  } catch (err) {
    console.error("[instrumentation] monitor bootstrap failed:", err.message);
  }
}
