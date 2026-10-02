/**
 * ai/recommender/recall.js — 多路召回
 *   CF     : 与本会话商品在其他会话中共现过的商品（行为相似人群信号）
 *   Content: 与种子商品的结构相似（类目/跟高/楦型家族/宽窄/价位带）—— baseline 变体
 *   Vector : 结构相似的路向量版（embeddings.js 余弦相似）—— vector_lr 变体（Phase 5）
 *   Popular: 全站热度兜底
 * 目录小（10 SKU）时对全量打分；目录变大后向量路原位换 ES/pgvector ANN，签名不变。
 */

import { productVector, queryVector, cosine } from "./embeddings";

function topN(scores, limit) {
  return new Map([...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit));
}

const VECTOR_SCALE = 3; // 余弦 [-1,1] → 与规则内容分同量纲（阈值 1.5 ⇒ 相似度 0.5+）

/**
 * 向量召回（Phase 5）—— 种子向量（PDP 相关）或档案向量（历史加权，个性化内容路）
 * @param {Map} productsById id → product 惰性取数器（编排层传入，避免重复 listProducts）
 */
export function recallVector({ seed, userFeat, candidates, productsById }) {
  const q = queryVector({ seed, userFeat, productsById });
  if (!q) return new Map();
  const scores = new Map();
  for (const p of candidates) {
    const s = cosine(q, productVector(p)) * VECTOR_SCALE;
    if (s > 0) scores.set(p.id, s);
  }
  return scores;
}

/**
 * item-item 共现召回
 * 其他会话与"我交互过的商品"重合越多 → 人群越像 → 该会话中的其他商品信号越强
 */
export function recallCollaborative(userFeat, interactions, { limit = 12 } = {}) {
  const myIds = [...new Set([...userFeat.viewed, ...userFeat.carted, ...userFeat.ordered])];
  if (!myIds.length) return new Map();

  const scores = new Map();
  for (const [sid, items] of interactions) {
    if (sid === userFeat.sessionId) continue; // 不自证
    const overlap = myIds.filter((id) => items.has(id)).length;
    if (!overlap) continue; // 与我无交集的会话无信号
    for (const [pid, w] of items) {
      if (myIds.includes(pid)) continue;
      // 对方会话中该商品的交互权重 × 与我的重合度
      scores.set(pid, (scores.get(pid) || 0) + w * overlap);
    }
  }
  return topN(scores, limit);
}

/** 结构相似召回 —— PDP"一周其他日子"的跨类目补充 + 访客冷启动主力 */
export function recallContent(seed, candidates) {
  if (!seed) return new Map();
  const family = String(seed.lastCode || "")[0]; // W/H/B/F 楦型家族，脚感相近
  const scores = new Map();
  for (const p of candidates) {
    let s = 0;
    if (p.category === seed.category) s += 2;
    if (p.heel === seed.heel) s += 0.6;
    if (family && String(p.lastCode || "")[0] === family) s += 1.2;
    if (p.widths.some((w) => seed.widths.includes(w))) s += 0.5;
    if (Math.abs(p.price - seed.price) / seed.price <= 0.35) s += 0.8; // 价位带相近
    if (s > 0) scores.set(p.id, s);
  }
  return scores;
}

/**
 * 全站热度（views + 2×carts + 5×orders）—— Phase 12 起为"当季热度"：
 * 同一热度分在当季类目放大、过季类目衰减（凉鞋的冬季热度多为误流量）。
 * 先验温和（|boost| ≤ 0.8 → 放大系数 ∈ [0.2, 1.8]），回流数据可覆盖。
 */
export function recallPopular(signals, candidates, { limit = 12, seasonal = {} } = {}) {
  const scores = new Map();
  for (const p of candidates) {
    const s = signals.get(p.id);
    const base = s ? s.views + s.carts * 2 + s.orders * 5 : 0;
    scores.set(p.id, Math.max(0, base * (1 + (seasonal[p.category] || 0))));
  }
  return topN(scores, limit);
}
