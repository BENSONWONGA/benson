/**
 * ai/recommender/bandit.js — 实验流量治理（Phase 9）
 *
 * Phase 5 的遗留缺口：分流固定 50/50，variantLift 有数据但没人消费 ——
 * 实验决策靠人盯看板。本模块把决策闭环交给系统（方案文档 §10 "灰度发布 +
 * AI 不达标时静默降级"的自动化形态）：
 *
 *   1) ε-greedy 自适应分流（多臂老虎机）：
 *      证据门（每变体 decided ≥ MIN_DECIDED 才参与分配决策）
 *      → 探索率 ε 随证据累积线性衰减（30% → 10% 下限，永不归零 ——
 *        分布漂移/季节切换的保险，J.B. 多臂老虎机的工程共识）
 *      → 当前最优变体（champion）拿 1-ε，其余未退役变体均分 ε。
 *      证据不足 → uniform —— 冷启动绝不因噪声追逐而误判。
 *
 *   2) Champion/Challenger 裁决（可审计的离散决策）：
 *      挑战者 lift ≥ +PROMOTE_LIFT_PCT 且证据充分 → promote（记录裁决 + 事件；
 *      部署切换是业务决策，系统只给裁决证据，不自动切全量）
 *      挑战者 lift ≤ KILL_LIFT_PCT → kill（退役：分流归零 —— 这是唯一
 *      系统自动执行的破坏性动作，因为继续给失败变体流量是纯浪费）
 *      其余 → hold
 *
 *   3) 治理器：startExperimentGovernor() 周期性 evaluate（默认 10min），
 *      instrumentation 启动。依赖图仅 db/metrics/model —— 与 recommender
 *      热路径的 cache.js 无关，Edge 编译安全（与 Phase 6/7/8 同款约束）。
 *
 * 与 model.js 的分工：model.js 学"哪个商品排前面"（排序层学习），
 * bandit.js 学"哪个变体值得更多流量"（实验层学习）—— 两层在同一份
 * 印象回流数据上学习，但目标与时间尺度不同（商品级 60s vs 变体级 10min）。
 *
 * 演进：多变体/多实验时此层原位换平台（Statsig/GrowthBook 的 bandit 模式），
 *       evaluateExperiment 签名不变。
 */

import { store, trackEvent } from "@/lib/db";
import { counter } from "@/lib/metrics";
import { variantLift } from "./model";

export const EXPERIMENT_ID = "rec_v2";

/**
 * 对照臂（Phase 11 增量测量）：固定 CONTROL_WEIGHT 流量走"无个性化"服务。
 * 它是测量基线不是竞争者 —— bandit 永不优化它、永不裁决它；
 * 个性化臂与它的转化率差 = 推荐系统的真实增量（attribution.js 只能给"在场率"）。
 */
export const CONTROL_ID = "control";
const CONTROL_WEIGHT = 5;

/** 变体注册表（id + 静态权重兜底；bandit 治理时竞争臂权重被动态分配取代） */
export const VARIANTS = [
  { id: "baseline", weight: 50 },  // 对照组：Phase 3 规则路径
  { id: "vector_lr", weight: 50 }, // 实验组：向量召回 + 学习排序
  { id: CONTROL_ID, weight: CONTROL_WEIGHT }, // 测量对照臂：无个性化，固定 5%
];

// ===== 治理参数（证据门槛 + 裁决阈值 —— 运营可调，但默认值即工程共识） =====
const MIN_DECIDED = 10;          // 证据门：每变体最少已判定样本（<10 的 CTR 是噪声）
const EPS_START = 0.30;          // 初始探索率 30%
const EPS_FLOOR = 0.10;          // 探索率下限 —— 永远保留 10% 流量给非冠军
const EPS_DECAY_PER_DECIDED = 0.005; // 每个已判定样本的探索率衰减（40 个样本到底）
const PROMOTE_LIFT_PCT = 10;     // 裁决：挑战者相对基线提升 ≥ +10% → promote
const KILL_LIFT_PCT = -10;       // 裁决：≤ -10% → kill
const GOVERNOR_INTERVAL_MS = Number(process.env.EXPERIMENT_GOVERNOR_INTERVAL_MS) || 10 * 60_000;

const decisionsCounter = counter("solfit_rec_experiment_decisions_total");

/** 治理状态（进程内；与 _model 同款生命周期约定 —— 骨架内存版） */
const _state = {
  mode: process.env.EXPERIMENT_MODE === "fixed" ? "fixed" : "adaptive",
  allocation: null,    // 当前生效分配（null = 未治理，回落静态权重）
  champion: null,       // 当前证据充分的 CTR 最优变体
  verdict: null,        // 最近一次裁决 {action, variant, liftPct, decided, at}
  retired: [],          // 被 kill 裁决退役的变体（baseline 永不退役 —— 基线是参照系）
  evaluations: 0,
  lastEvalAt: null,
};

/** 当前生效分配（assignVariant 热路径读 —— 纯对象读，无锁无 IO）。
 *  模式语义：
 *    adaptive → bandit 治理分配（证据不足/未评估时为 null → 均分灰度）
 *    manual    → 人工设定/setAllocation 或 conclude 的分配【仍然生效】——
 *                manual 只停"自动重分配"，不停"分配生效"（否则 conclude 的
 *                终局分配会被静态权重静默覆盖 —— 流量根本不按终局走）
 *    fixed     → 恒 null，调用方回落 VARIANTS 静态权重（灰度冻结，用于回归排查） */
export function currentAllocation() {
  if (_state.mode === "fixed") return null;
  return _state.allocation ?? null;
}

/** 治理状态快照（看板 / API） */
export function banditState() {
  return {
    mode: _state.mode,
    allocation: _state.allocation,
    champion: _state.champion,
    verdict: _state.verdict,
    retired: [..._state.retired],
    evaluations: _state.evaluations,
    lastEvalAt: _state.lastEvalAt,
    params: { minDecided: MIN_DECIDED, epsFloor: EPS_FLOOR, epsStart: EPS_START, promoteLiftPct: PROMOTE_LIFT_PCT, killLiftPct: KILL_LIFT_PCT },
  };
}

/** 探索率：随证据累积衰减，floor 保底（分布漂移保险） */
function epsilon(totalDecided) {
  return Math.max(EPS_FLOOR, EPS_START - totalDecided * EPS_DECAY_PER_DECIDED);
}

/** 整数化权重并归一为 100（防舍入漂移） */
function normalizeWeights(raw, variantIds) {
  const ints = variantIds.map((id) => ({ id, w: Math.max(0, Math.round(raw[id] || 0)) }));
  const sum = ints.reduce((a, b) => a + b.w, 0);
  if (!sum) return Object.fromEntries(variantIds.map((v) => [v, 0])); // 全零只在单变体存活时出现
  // 修正到总和 100：差额加给最大权重项
  let drift = 100 - sum;
  let maxIdx = 0;
  ints.forEach((x, i) => { if (x.w > ints[maxIdx].w) maxIdx = i; });
  ints[maxIdx].w += drift;
  return Object.fromEntries(ints.map((x) => [x.id, Math.max(0, x.w)]));
}

/**
 * 治理评估轮 —— ε-greedy 重分配 + Champion/Challenger 裁决。
 * 幂等无副作用竞争：单进程内存态 + 治理器串行调用（setInterval 不并发）。
 * @returns {{state, lift, decided}} 完整决策证据（API/看板/审计共用）
 */
export function evaluateExperiment() {
  const lift = variantLift();
  _state.evaluations++;
  _state.lastEvalAt = new Date().toISOString();

  const byId = Object.fromEntries(lift.map((l) => [l.variant, l]));
  const totalDecided = lift.reduce((a, l) => a + l.decided, 0);
  const eps = epsilon(totalDecided);

  // ===== 1) Champion/Challenger 裁决（先裁后分 —— kill 退役当轮即从分配中归零） =====
  const base = byId["baseline"];
  const newVerdicts = [];
  for (const v of VARIANTS) {
    const id = v.id;
    // 基线是参照系永不退役；对照臂是测量基线永不裁决 —— 只裁真正的挑战者
    if (id === "baseline" || id === CONTROL_ID || _state.retired.includes(id)) continue;
    const ch = byId[id];
    if (!ch || ch.liftVsBaselinePct === null) continue; // 证据未成形 → 不裁
    if (ch.decided < MIN_DECIDED || (base?.decided || 0) < MIN_DECIDED) continue; // 证据门：双侧都要过

    if (ch.liftVsBaselinePct >= PROMOTE_LIFT_PCT) {
      newVerdicts.push({ action: "promote", variant: id, liftPct: ch.liftVsBaselinePct, decided: ch.decided });
    } else if (ch.liftVsBaselinePct <= KILL_LIFT_PCT) {
      newVerdicts.push({ action: "kill", variant: id, liftPct: ch.liftVsBaselinePct, decided: ch.decided });
      _state.retired.push(id);
    }
  }

  // ===== 2) champion：证据充分的活跃"竞争臂"中 CTR 最高者（对照臂不参赛） =====
  const activeIds = VARIANTS.map((v) => v.id).filter((id) => !_state.retired.includes(id));
  const contenderIds = activeIds.filter((id) => id !== CONTROL_ID);
  const eligible = contenderIds
    .map((id) => byId[id])
    .filter((l) => l && l.decided >= MIN_DECIDED && l.ctr !== null);
  // 需要两个以上合格臂才有比较意义；唯一竞争臂时直接称王（kill 退役后的终态）
  _state.champion =
    eligible.length > 1
      ? eligible.reduce((best, x) => (x.ctr > best.ctr ? x : best)).variant
      : eligible.length === 1 && contenderIds.length === 1
        ? eligible[0].variant
        : null;

  // ===== 3) ε-greedy 分配（对照臂恒定 CONTROL_WEIGHT，竞争臂分剩余流量） =====
  const budget = 100 - CONTROL_WEIGHT;
  const raw = { [CONTROL_ID]: CONTROL_WEIGHT };
  if (!_state.champion) {
    // 无冠军（证据不足）→ 竞争臂均分预算（保持灰度语义，绝不赌单臂）
    for (const id of contenderIds) raw[id] = budget / contenderIds.length;
  } else {
    for (const id of contenderIds) raw[id] = id === _state.champion ? (1 - eps) * budget : 0;
    const challengers = contenderIds.filter((id) => id !== _state.champion);
    for (const id of challengers) raw[id] = (eps * budget) / challengers.length;
  }
  for (const v of VARIANTS) raw[v.id] = raw[v.id] ?? 0; // 全变体覆盖（退役/未知补零）
  _state.allocation = normalizeWeights(raw, VARIANTS.map((v) => v.id));

  // ===== 4) 裁决落账（分配已定 —— 审计记录含本轮生效的分配，而非上一轮） =====
  for (const nv of newVerdicts) {
    _state.verdict = { ...nv, at: _state.lastEvalAt };
    const log = store("experimentDecisions");
    log.push({ ..._state.verdict, allocation: { ..._state.allocation } });
    while (log.length > 100) log.shift();
    trackEvent("experiment_decided", { action: nv.action, variant: nv.variant, liftPct: nv.liftPct, decided: nv.decided });
    decisionsCounter.inc(1, { action: nv.action });
  }

  // ===== 5) 无新裁决时保持 hold 态可见（审计连续性：每轮都有结论可查） =====
  if (!_state.verdict) {
    _state.verdict = { action: "hold", variant: null, liftPct: null, decided: totalDecided, at: _state.lastEvalAt, note: "waiting_for_evidence" };
  }

  const decided = { total: totalDecided, eps: Math.round(eps * 100) / 100, eligible: eligible.map((e) => e.variant) };
  return { state: banditState(), lift, decided };
}

/** 裁决落账已内联到 evaluateExperiment 第 4 步（保证审计记录的是本轮分配） */

/** 人工干预：直接指定分配（mode 切 manual —— bandit 停止自动重分配直到 mode 复位） */
export function setAllocation(weights, { mode = "manual" } = {}) {
  const known = VARIANTS.map((v) => v.id);
  for (const id of Object.keys(weights || {})) {
    if (!known.includes(id)) throw new Error("UNKNOWN_VARIANT: " + id);
  }
  if (mode === "adaptive") {
    // 复位自动治理：清人工痕迹，让下一轮 evaluate 从证据重新出发
    _state.allocation = null;
    _state.retired = [];
    _state.champion = null;
  } else {
    _state.allocation = normalizeWeights(weights, known);
  }
  _state.mode = mode;
  return banditState();
}

/** 终局动作：实验结论落账 + 竞争臂赢家吃 90%（对照臂恒定 5% —— 增量测量永不下线） */
export function concludeExperiment() {
  const { lift } = evaluateExperiment();
  const winner = _state.champion || "baseline";
  const challengers = VARIANTS.map((v) => v.id).filter((id) => id !== winner && id !== CONTROL_ID);
  const raw = { [winner]: 95 - CONTROL_WEIGHT, [CONTROL_ID]: CONTROL_WEIGHT };
  for (const id of challengers) raw[id] = 0; // 终局：输掉的竞争臂退役为 0（对照臂除外）
  _state.allocation = normalizeWeights(raw, VARIANTS.map((v) => v.id));
  _state.mode = "manual"; // 终局后停止自动摇摆，重启实验需显式复位（setAllocation mode=adaptive）
  const log = store("experimentDecisions");
  const entry = { action: "concluded", variant: winner, at: new Date().toISOString(), allocation: { ..._state.allocation } };
  log.push(entry);
  trackEvent("experiment_decided", { action: "concluded", variant: winner, liftPct: null, decided: null });
  decisionsCounter.inc(1, { action: "concluded" });
  return { ...entry, lift };
}

/** 定时治理器 —— instrumentation.register() 启动（默认 10min；0 禁用） */
let _governorStarted = false;
export function startExperimentGovernor() {
  if (_governorStarted) return null; // 幂等（HMR/多入口防护）
  const interval = GOVERNOR_INTERVAL_MS;
  if (interval <= 0) return null;
  _governorStarted = true;
  const timer = setInterval(() => {
    try {
      if (_state.mode !== "adaptive") return; // manual/fixed 期间不自动动流量
      const r = evaluateExperiment();
      if (r.state.verdict?.action && r.state.verdict.action !== "hold") {
        console.log(`[bandit] verdict=${r.state.verdict.action} variant=${r.state.verdict.variant} lift=${r.state.verdict.liftPct}%`);
      }
    } catch (err) {
      console.error("[bandit] evaluate failed:", err.message); // 单轮失败不停止治理
    }
  }, interval);
  timer.unref?.();
  console.log(`[bandit] governor started (${Math.round(interval / 60_000)}min interval, mode=${_state.mode})`);
  return timer;
}
