/**
 * ai/recommender/experiments.js — 灰度分流（Phase 5）
 *
 * 方案文档 §10："AI 冷启动无数据 → 规则兜底 + 灰度发布；AI 不达标时静默降级"。
 * 会话级确定性分桶（FNV 哈希，无状态、无粘性问题）：
 *   baseline   ：Phase 3 行为（规则内容召回 + 人工权重排序）—— 对照组
 *   vector_lr  ：向量召回 + 学习排序 —— 实验组
 * 两变体共用同一 CF/热度召回与候选过滤，仅内容路与排序权重不同 ——
 * 归因干净；变体写入 recommend_served 事件（variant 字段），效果回流可查。
 *
 * 演进：流量上去后此层接 A/B 平台（分桶维度/权重运行时可调），签名不变。
 */

const EXPERIMENT_ID = "rec_v2";

/** 变体流量配比（权重和 100） */
const VARIANTS = [
  { id: "baseline", weight: 50 },  // 对照：Phase 3 规则路径
  { id: "vector_lr", weight: 50 }, // 实验：向量召回 + 学习排序
];

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 会话 → 变体（确定性：同会话恒定，跨实例一致）
 * @param {string|null} sessionId 无会话（匿名 SSR）返回 null —— 冷启动不进实验
 */
export function assignVariant(sessionId) {
  if (!sessionId) return null;
  const bucket = fnv1a(EXPERIMENT_ID + "|" + sessionId) % 100;
  let acc = 0;
  for (const v of VARIANTS) {
    acc += v.weight;
    if (bucket < acc) return v.id;
  }
  return "baseline";
}

/** 实验元信息（看板展示） */
export function experimentMeta() {
  return { id: EXPERIMENT_ID, variants: VARIANTS.map((v) => v.id) };
}
