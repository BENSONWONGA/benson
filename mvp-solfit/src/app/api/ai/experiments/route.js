import { NextResponse } from "next/server";
import { evaluateExperiment, banditState, setAllocation, concludeExperiment } from "@/ai/recommender/bandit";
import { variantLift } from "@/ai/recommender/model";
import { store } from "@/lib/db";
import { observed } from "@/lib/observe";

/**
 * GET  /api/ai/experiments — 实验治理状态（Phase 9）
 *   响应：治理状态（模式/分配/champion/最近裁决）+ 变体效果回流表（lift）+ 决策日志
 *
 * POST /api/ai/experiments — 治理动作（body: {action}）
 *   action=evaluate         跑一轮 ε-greedy 重分配 + 裁决（治理器周期外手动触发）
 *   action=conclude         实验终局：champion 吃 90%，停止自动摇摆（mode → manual）
 *   action=set              人工指定分配：body {weights: {baseline, vector_lr}, mode?}
 *                            mode="adaptive" 为复位自动治理（清 retired/champion 痕迹）
 *
 * TODO(上生产): 内部运营端点必须挂内部认证（与 /api/monitoring 同批）。
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  return observed("ai-experiments", async () => {
    const decisions = store("experimentDecisions");
    return NextResponse.json({
      code: 0,
      data: {
        state: banditState(),
        lift: variantLift(),
        decisions: decisions.slice(-20).reverse(), // 最近 20 条，新的在前
      },
    });
  });
}

export async function POST(request) {
  return observed("ai-experiments", async () => {
    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === "evaluate") {
      const result = evaluateExperiment();
      return NextResponse.json({ code: 0, data: result });
    }

    if (action === "conclude") {
      const result = concludeExperiment();
      return NextResponse.json({ code: 0, data: { concluded: result, state: banditState() } });
    }

    if (action === "set") {
      const weights = body?.weights;
      if (!weights || typeof weights !== "object") {
        return NextResponse.json({ code: 400, message: "weights required" }, { status: 400 });
      }
      const mode = ["adaptive", "manual", "fixed"].includes(body?.mode) ? body.mode : "manual";
      try {
        const state = setAllocation(weights, { mode });
        return NextResponse.json({ code: 0, data: { state } });
      } catch (err) {
        return NextResponse.json({ code: 400, message: err.message }, { status: 400 });
      }
    }

    return NextResponse.json({ code: 400, message: "action must be evaluate|conclude|set" }, { status: 400 });
  });
}
