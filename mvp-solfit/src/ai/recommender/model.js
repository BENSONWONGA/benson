/**
 * ai/recommender/model.js — 学习排序（Phase 5：排序层原位升级）
 *
 * 兑现 rank.js 的演进注释："特征已沉淀，原位换 lightGBM/DNN —— 输入特征向量、
 * 输出排序不变"。8 维特征（cf/content/popular/conv/rating/catAff/widthFit/priceFit）
 * 继续沿用 —— 在线逻辑回归先把"特征 → 权重"从人工规则变成数据驱动，
 * 目录与流量上去后此文件原位换 GBDT/DNN，特征与调用方（rank.js）零改动。
 *
 * 闭环链路（方案文档 §7.3）：
 *   recommend() 印象落库（recTrainingSet，印象时刻特征快照）
 *     → 用户后续行为回流标注（cart_added / order_created = 正样本）
 *     → maybeTrain() 惰性训练（60s 节流）
 *     → 质量门（样本量/两类均衡/留出集 AUC≥0.6）通过才启用
 *     → 不达标静默降级规则权重（方案文档 §10："AI 不达标时静默降级"）
 *
 * GDPR：样本含 sessionId 供标注关联，erase 时脱关联（privacy/erase），
 * 脱关联后特征仍可用于训练（特征非识别性，与 fit_training_set 同策略）。
 */

import { store } from "@/lib/db";
import { counter, gauge } from "@/lib/metrics";

// 与 rank.js 特征表一一对应（顺序即权重向量下标 —— 换模型时保持此契约）
export const FEATURE_KEYS = ["cf", "content", "popular", "conv", "rating", "catAff", "widthFit", "priceFit"];

const RULE_WEIGHTS = [2.0, 1.4, 0.7, 1.6, 0.8, 1.0, 1.8, 0.5]; // rank.js 的人工权重（冷模型）

const MAX_SAMPLES = 500;      // 训练样本环形上限（事件缓冲 1000，样本量级同步）
const MIN_SAMPLES = 20;       // 质量门：总样本
const MIN_PER_CLASS = 3;      // 质量门：两类均衡（防全负样本训出常数模型）
const POS_WEIGHT = 5;         // 隐式反馈天然失衡（view >> cart）—— 正样本损失加权
const LR = 0.15;
const L2 = 0.01;
const EPOCHS = 8;
const RETRAIN_INTERVAL_MS = Number(process.env.REC_TRAIN_INTERVAL_MS) || 60_000;
const LABEL_WINDOW_MS = Number(process.env.REC_LABEL_WINDOW_MS) || 5 * 60_000; // 超窗未转化 = 负样本；窗内未定 = 跳过
const MIN_AUC = 0.6;          // 留出集 AUC 门槛（不比随机好就继续用规则）

const variantTotal = counter("solfit_rec_variant_total");
const modelSamplesGauge = gauge("solfit_rec_model_samples");
const modelAucGauge = gauge("solfit_rec_model_auc");
const modelWarmGauge = gauge("solfit_rec_model_warm");

const _model = {
  weights: null,       // 学习权重（warm 后非空）
  bias: 0,
  warm: false,
  samples: 0, positives: 0,
  auc: null, trainedAt: null,
  lastTrainAt: 0,
  lastNote: "cold",    // 最近一次训练结论（看板可解释性）
};

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

/**
 * 回流标注 —— 印象时刻之后该会话对同商品是否升级行为（加购/下单）
 * 正样本 = 转化；超标注窗未转化 = 负样本；窗内未定 = 跳过
 */
function labelSamples(samples, now) {
  // 一次遍历建索引：sessionId -> [{productId, ts}]（cart_added 与订单成交行）
  const escalated = new Map();
  const push = (sid, productId, ts) => {
    const arr = escalated.get(sid) || [];
    arr.push({ productId, ts });
    escalated.set(sid, arr);
  };
  for (const e of store("events")) {
    const p = e.payload || {};
    if (e.type === "cart_added" && p.sessionId && p.productId) push(p.sessionId, p.productId, e.ts);
  }
  for (const o of store("orders").values()) {
    if (!o.sessionId) continue; // GDPR 脱关联的订单不参与标注（样本同理会脱关联）
    for (const i of o.items) push(o.sessionId, i.productId, o.createdAt);
  }

  const labeled = [];
  for (const s of samples) {
    const esc = (escalated.get(s.sessionId) || []).some(
      (x) => x.productId === s.productId && (!s.ts || x.ts >= s.ts)
    );
    if (esc) {
      labeled.push({ ...s, y: 1 });
      continue;
    }
    const age = now - new Date(s.ts).getTime();
    if (age > LABEL_WINDOW_MS) labeled.push({ ...s, y: 0 }); // 超窗未转化 —— 负样本
    // 窗内未定 → 跳过（不要用"太新"的样本污染训练）
  }
  return labeled;
}

/** Mann-Whitney AUC（留出集质量门） */
function auc(weights, pairs) {
  const pos = pairs.filter((p) => p.y === 1);
  const neg = pairs.filter((p) => p.y === 0);
  if (!pos.length || !neg.length) return null;
  const score = (s) => {
    let z = 0;
    for (let i = 0; i < FEATURE_KEYS.length; i++) z += weights[i] * (s.features[FEATURE_KEYS[i]] || 0);
    return z;
  };
  let wins = 0;
  for (const p of pos) {
    const a = score(p);
    for (const n of neg) wins += a > score(n) ? 1 : a === score(n) ? 0.5 : 0;
  }
  return wins / (pos.length * neg.length);
}

/**
 * 训练入口 —— recommend() 每次调用触发（60s 节流）；
 * 也可由监控/运维显式调用（force=true 立即重训）。
 */
export function maybeTrain({ force = false, now = Date.now() } = {}) {
  if (!force && now - _model.lastTrainAt < RETRAIN_INTERVAL_MS) return modelState();
  _model.lastTrainAt = now;

  const samples = labelSamples(store("recTrainingSet"), now);
  const positives = samples.filter((s) => s.y === 1).length;

  _model.samples = samples.length;
  _model.positives = positives;
  modelSamplesGauge.set(samples.length);

  // ===== 质量门：样本量 + 两类均衡 =====
  if (samples.length < MIN_SAMPLES || positives < MIN_PER_CLASS || samples.length - positives < MIN_PER_CLASS) {
    _model.lastNote = "waiting_for_samples";
    if (_model.warm) return modelState(); // 已有合格模型 → 继续用（不因数据变差而降级）
    return modelState();
  }

  // ===== 训练/留出划分：按时间序，最近 20% 做留出集 =====
  const sorted = [...samples].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const holdoutSize = Math.max(4, Math.floor(sorted.length * 0.2));
  const trainSet = sorted.slice(0, sorted.length - holdoutSize);
  const holdout = sorted.slice(-holdoutSize);

  const weights = new Array(FEATURE_KEYS.length).fill(0);
  let bias = 0;
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    for (const s of trainSet) {
      let z = bias;
      for (let i = 0; i < FEATURE_KEYS.length; i++) z += weights[i] * (s.features[FEATURE_KEYS[i]] || 0);
      const err = s.y - sigmoid(z);
      const w = err * (s.y ? POS_WEIGHT : 1); // 正样本损失加权
      for (let i = 0; i < FEATURE_KEYS.length; i++) {
        weights[i] += LR * (w * (s.features[FEATURE_KEYS[i]] || 0) - L2 * weights[i]);
      }
      bias += LR * w;
    }
  }

  // ===== 质量门：留出集 AUC =====
  const holdoutAuc = auc(weights, holdout);
  modelAucGauge.set(holdoutAuc ?? 0);

  if (holdoutAuc === null || holdoutAuc < MIN_AUC) {
    // 新模型不达标 —— 不顶替现任（无现任则继续冷启动走规则权重）
    _model.lastNote = holdoutAuc === null ? "holdout_single_class" : `auc_${Math.round(holdoutAuc * 100)}_below_gate`;
    return modelState();
  }

  _model.weights = weights;
  _model.bias = bias;
  _model.warm = true;
  _model.auc = Math.round(holdoutAuc * 1000) / 1000;
  _model.trainedAt = new Date(now).toISOString();
  _model.lastNote = `warm_auc_${_model.auc}`;
  modelWarmGauge.set(1);
  return modelState();
}

/** 学习权重下标（供 rank.js 对齐）—— 冷模型返回 null，调用方降级规则权重 */
export function learnedWeights() {
  return _model.warm ? { weights: _model.weights, bias: _model.bias } : null;
}

/** 规则权重兜底导出（与 rank.js 的人工权重同源，单一事实） */
export function ruleWeights() {
  return { weights: RULE_WEIGHTS, bias: 0 };
}

/** 印象落库 —— recommend() 每次服务时记录 top-K 的印象时刻特征快照 */
export function logImpression({ sessionId, variant, ranked, max }) {
  const buf = store("recTrainingSet");
  for (const r of ranked.slice(0, max)) {
    if (!r.features) continue;
    buf.push({ sessionId, productId: r.product.id, variant, features: r.features, ts: new Date().toISOString() });
  }
  while (buf.length > MAX_SAMPLES) buf.shift();
}

/** 变体流量打点（A/B 看板数据源）—— Prometheus 计数 + 进程内 tally */
const _variantCounts = {};
export function noteVariant(variant) {
  variantTotal.inc(1, { variant });
  _variantCounts[variant] = (_variantCounts[variant] || 0) + 1;
}

/**
 * 实验效果回流（Phase 6）—— 兑现 experiments.js 的承诺"变体写入事件，效果回流可查"：
 * 按变体聚合已判定印象的转化率（decided = 已回流标注：转化 or 超窗负样本），
 * 实验组相对 baseline 的 lift% 即灰度决策依据（目录/流量上去后换数仓离线口径）。
 */
export function variantLift() {
  const now = Date.now();
  const all = store("recTrainingSet");
  const perVariant = {};
  for (const s of all) {
    const v = s.variant || "baseline";
    const agg = perVariant[v] || (perVariant[v] = { impressions: 0, decided: 0, positives: 0 });
    agg.impressions++;
  }
  for (const s of labelSamples(all, now)) {
    const agg = perVariant[s.variant || "baseline"];
    agg.decided++;
    if (s.y === 1) agg.positives++;
  }
  const base = perVariant.baseline;
  const baseCtr = base && base.decided ? base.positives / base.decided : null;
  return Object.entries(perVariant)
    .map(([variant, a]) => {
      const ctr = a.decided ? a.positives / a.decided : null;
      return {
        variant,
        impressions: a.impressions,
        decided: a.decided,
        positives: a.positives,
        ctr: ctr === null ? null : Math.round(ctr * 1000) / 1000,
        liftVsBaselinePct:
          baseCtr && ctr !== null && variant !== "baseline"
            ? Math.round(((ctr / baseCtr - 1) * 100) * 10) / 10
            : null,
      };
    })
    .sort((a, b) => a.variant.localeCompare(b.variant));
}

/** 模型健康快照 —— 监控看板 / overview API */
export function modelState() {
  return {
    warm: _model.warm,
    samples: _model.samples,
    positives: _model.positives,
    impressions: store("recTrainingSet").length,
    auc: _model.auc,
    trainedAt: _model.trainedAt,
    note: _model.lastNote,
    variantCounts: { ..._variantCounts },
    weights: _model.warm
      ? Object.fromEntries(FEATURE_KEYS.map((k, i) => [k, Math.round(_model.weights[i] * 1000) / 1000]))
      : null,
  };
}
