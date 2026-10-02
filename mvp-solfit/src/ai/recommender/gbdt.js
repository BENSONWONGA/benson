/**
 * ai/recommender/gbdt.js — 自研梯度提升树（Phase 15：排序层原位升级）
 *
 * 兑现 model.js 头注释："目录与流量上去后此文件原位换 GBDT/DNN"。
 * 纯 JS 实现、零外部依赖（与在线 LR 同一工程纪律：小样本、可审计、可热降级）：
 *
 *   目标函数：logistic loss（CTR 预估口径与 LR 完全一致，AUC 才可比）
 *     初始化 F₀ = log(p̄ / (1-p̄))（样本先验 logit，防全零起步）
 *     每轮：g_i = w_i·(y_i - σ(F_i))   （负梯度）
 *           h_i = w_i·σ(F_i)(1-σ(F_i))  （hessian）
 *           按 (g,h) 建回归树，叶值取 Newton 步 -Σg/Σh（比均值叶收敛稳）
 *           F ← F + shrinkage × tree(x)
 *
 *   与 LR 的分工（同一份印象/标注燃料，质量门择优上岗）：
 *     LR   —— 线性可分场景、参数可解释（权重即看板）、小样本更稳
 *     GBDT —— 特征间非线性交互（如 content×catAff 的组合效应）、
 *             对特征量纲不敏感（分裂天然找阈值，无需归一化假设）
 *   两候选留出集 AUC 竞争，winner 上岗（model.js 裁决）—— 这是
 *   "原位换模型"的工程形态：特征契约冻结，模型可插拔。
 *
 * 超参纪律：样本环形上限 500（model.js MAX_SAMPLES 同口径），
 *   8 维特征、深度 3、≤40 轮 ⇒ 每轮 ≤7 个分裂点 × 8 维 × ≤500 行，
 *   训练毫秒级 —— 塞进 maybeTrain 的 60s 节流毫无压力。
 *
 * GDPR：树只吃特征快照（非识别性）与标注，不含 PII —— 与 LR 同口径。
 */

const DEFAULTS = {
  rounds: 40,      // 提升轮数（= 树数）
  maxDepth: 3,     // 浅树防过拟合（500 样本量级深树必记噪声）
  minLeaf: 4,      // 叶子最小样本数（加权口径）
  shrinkage: 0.3,  // 学习率（每棵树的贡献折扣）
  minChildWeight: 1e-6, // Newton 叶值稳定下限（hessian 过小不裂）
};

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/**
 * 训练 —— 输入已标注样本，输出可序列化模型
 * @param {{features:Object, y:0|1, weight?:number}[]} samples
 *   features: 8 维特征快照（recTrainingSet 印象时刻落库，见 model.js）
 *   weight:   正样本损失加权（与 LR 的 POS_WEIGHT 同口径，默认 1）
 * @returns {{f0:number, shrinkage:number, trees:object[], importance:Object}}|null
 */
export function trainGBDT(samples, { featureKeys, ...opts } = {}) {
  if (!samples?.length || !featureKeys?.length) return null;

  const cfg = { ...DEFAULTS, ...opts };
  const K = featureKeys.length;

  // 加权先验 logit（防 p̄=0/1 的除零 —— 压到 [0.05, 0.95]）
  let posW = 0;
  let totW = 0;
  for (const s of samples) {
    const w = s.weight ?? 1;
    totW += w;
    if (s.y) posW += w;
  }
  const p = Math.min(0.95, Math.max(0.05, totW ? posW / totW : 0.5));
  const f0 = Math.log(p / (1 - p));

  // 预抽特征数组（热点循环避免重复查 key）
  const X = samples.map((s) => featureKeys.map((k) => s.features?.[k] ?? 0));
  const y = samples.map((s) => s.y);
  const w = samples.map((s) => s.weight ?? 1);
  const F = new Array(samples.length).fill(f0);

  const trees = [];
  const gain = new Array(K).fill(0); // 特征重要度：分裂增益累计（看板可解释性）

  for (let r = 0; r < cfg.rounds; r++) {
    const g = new Array(X.length);
    const h = new Array(X.length);
    for (let i = 0; i < X.length; i++) {
      const s = sigmoid(F[i]);
      // g 为损失梯度（XGBoost 约定：σ(F)-y）；叶值 -Σg/Σh 即 Newton 上升步
      g[i] = w[i] * (s - y[i]);
      h[i] = Math.max(w[i] * s * (1 - s), 1e-8);
    }
    const tree = buildTree({ X, g, h, featureKeys, gain, cfg });
    if (!tree) break; // 无有效分裂（数据不可分/增益耗尽）—— 提前收敛
    for (let i = 0; i < X.length; i++) F[i] += cfg.shrinkage * predictTree(tree, X[i]);
    trees.push(tree);
  }

  if (!trees.length) return null;
  const totGain = gain.reduce((a, b) => a + b, 0) || 1;
  return {
    f0,
    shrinkage: cfg.shrinkage,
    trees,
    rounds: trees.length,
    importance: Object.fromEntries(featureKeys.map((k, i) => [k, totGain ? Math.round((gain[i] / totGain) * 1000) / 1000 : 0])),
  };
}

/** CART 回归树（Newton 目标）：加权方差增益贪心分裂，递归建树 */
function buildTree({ X, g, h, featureKeys, gain, cfg }) {
  const idx = X.map((_, i) => i);
  let totGain = 0;
  const best = findBestSplit(X, g, h, idx, featureKeys, cfg);
  if (!best) return null;
  totGain += best.gain;
  gain[best.featureIdx] += best.gain;

  const root = splitNode(X, g, h, idx, best, featureKeys, gain, cfg, 1);
  return root;
}

/** 递归分裂：返回 {leaf:true, value} | {feature, threshold, left, right} */
function splitNode(X, g, h, idx, split, featureKeys, gain, cfg, depth) {
  // 叶值 = Newton 步：-Σg/Σh（logloss 的精确最小化步）
  const leafValue = (rows) => {
    let sg = 0;
    let sh = 0;
    for (const i of rows) {
      sg += g[i];
      sh += h[i];
    }
    return -sg / Math.max(sh, cfg.minChildWeight);
  };

  if (depth >= cfg.maxDepth || idx.length < 2 * cfg.minLeaf) {
    return { leaf: true, value: leafValue(idx) };
  }

  const best = findBestSplit(X, g, h, idx, featureKeys, cfg);
  if (!best) return { leaf: true, value: leafValue(idx) };

  gain[best.featureIdx] += best.gain;

  const left = [];
  const right = [];
  for (const i of idx) (X[i][best.featureIdx] <= best.threshold ? left : right).push(i);
  if (left.length < cfg.minLeaf || right.length < cfg.minLeaf) {
    return { leaf: true, value: leafValue(idx) };
  }

  return {
    fidx: best.featureIdx, // 建树时锁维度下标（预测热路径零查找）
    feature: featureKeys[best.featureIdx],
    threshold: best.threshold,
    left: splitNode(X, g, h, left, best, featureKeys, gain, cfg, depth + 1),
    right: splitNode(X, g, h, right, best, featureKeys, gain, cfg, depth + 1),
  };
}

/** 单节点最优分裂：逐特征扫描候选阈值（unique 中点），加权增益 = Δ(Σg²/Σh) */
function findBestSplit(X, g, h, idx, featureKeys, cfg) {
  let best = null;
  for (let f = 0; f < featureKeys.length; f++) {
    const vals = [...new Set(idx.map((i) => X[i][f]))].sort((a, b) => a - b);
    if (vals.length < 2) continue; // 常数维无分裂点
    for (let t = 0; t < vals.length - 1; t++) {
      const threshold = (vals[t] + vals[t + 1]) / 2;
      let lg = 0;
      let lh = 0;
      let rg = 0;
      let rh = 0;
      let ln = 0;
      let rn = 0;
      for (const i of idx) {
        if (X[i][f] <= threshold) {
          lg += g[i];
          lh += h[i];
          ln++;
        } else {
          rg += g[i];
          rh += h[i];
          rn++;
        }
      }
      if (ln < cfg.minLeaf || rn < cfg.minLeaf) continue;
      // XGBoost 式增益（λ=0）：父 Σg²/Σh 与两子之和的差
      const gh = (gg, hh) => (gg * gg) / Math.max(hh, cfg.minChildWeight);
      const splitGain = gh(lg, lh) + gh(rg, rh) - gh(lg + rg, lh + rh);
      if (!best || splitGain > best.gain) best = { featureIdx: f, threshold, gain: splitGain };
    }
  }
  return best?.gain > 1e-10 ? best : null;
}

/** 单树预测（x 为已按 featureKeys 排序的特征数组） */
function predictTree(node, x) {
  while (!node.leaf) node = x[node.fidx] <= node.threshold ? node.left : node.right;
  return node.value;
}

/**
 * 打分 —— model.js predictScore 的 GBDT 分支
 * @returns {number} logit（与 LR 的 Σw·x+b 同量纲：越大越可能转化）
 */
export function predictGBDT(model, features, featureKeys) {
  if (!model || !features) return 0;
  const x = featureKeys.map((k) => features[k] ?? 0);
  let f = model.f0;
  for (const t of model.trees) f += model.shrinkage * predictTree(t, x);
  return f;
}

/** 特征重要度（看板：GBDT 上岗时替代 LR 权重的可解释口径） */
export function gbdtImportance(model) {
  return model?.importance ?? null;
}
