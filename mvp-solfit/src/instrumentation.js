/**
 * instrumentation.js — 服务进程启动钩子（Phase 4 起）
 * register() 在每个 Next 服务器进程启动时执行一次：
 *   - 告警评估器（30s 周期；评估内部另有 60s 节流）
 *   - 弃购召回投递器（Phase 6：默认 5min 周期；RECOVERY_DISPATCH_INTERVAL_MS=0 禁用）
 *   - Kafka sink 等惰性初始化不在此处触发（首次事件时自举）
 *
 * 构建期（NEXT_PHASE=phase-production-build）跳过 —— 不阻塞静态导出。
 */

export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { startEvaluator } = await import("@/lib/alerts");
    startEvaluator();
    // 弃购投递器来自独立 recovery 模块 —— 不经 recommender（cache/ioredis），
    // 保证 instrumentation 的 Edge 编译入口依赖图干净。
    const { startRecoveryDispatcher } = await import("@/ai/recovery");
    startRecoveryDispatcher();
    // 留存摘要投递器（Phase 7：默认 7 天周期；与 recovery 共享单客频控账本）
    const { startRetentionDispatcher } = await import("@/ai/retention");
    startRetentionDispatcher();
    // 实验治理器（Phase 9：默认 10min 周期跑 ε-greedy 重分配 + 裁决；
    // bandit.js 依赖图仅 db/metrics/model —— 不经 recommender/index 的 cache/ioredis）
    const { startExperimentGovernor } = await import("@/ai/recommender/bandit");
    startExperimentGovernor();
  } catch (err) {
    console.error("[instrumentation] monitor bootstrap failed:", err.message);
  }
}
