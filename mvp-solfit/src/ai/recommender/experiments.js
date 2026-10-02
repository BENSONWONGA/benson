/**
 * ai/recommender/experiments.js — 灰度分流（Phase 5 分桶机制 + Phase 9 动态治理）
 *
 * 方案文档 §10："AI 冷启动无数据 → 规则兜底 + 灰度发布；AI 不达标时静默降级"。
 * 会话级确定性分桶（FNV 哈希，无状态、无粘性问题）：
 *   baseline   ：Phase 3 行为（规则内容召回 + 人工权重排序）—— 对照组
 *   vector_lr  ：向量召回 + 学习排序 —— 实验组
 * 两变体共用同一 CF/热度召回与候选过滤，仅内容路与排序权重不同 ——
 * 归因干净；变体写入 recommend_served 事件（variant 字段），效果回流可查。
 *
 * Phase 9 起，分桶的"权重"不再写死：
 *   adaptive 模式 → 读 bandit.js 的 ε-greedy 治理分配（champion 吃 1-ε，
 *                   证据不足时回落均分 —— 冷启动期仍是干净灰度）
 *   manual 模式   → 人工/终局设定的分配继续生效（只停自动重分配）
 *   fixed 模式    → 治理分配被忽略，回落本文件静态权重（灰度冻结排查用）
 * 哈希桶本身不变 —— 同一会话分到哪个桶是确定性的，变的只是桶边界。
 *
 * 变体注册表（VARIANTS/EXPERIMENT_ID）随 Phase 9 迁至 bandit.js 单一维护，
 * 本文件只保留分桶机制与元信息（避免 experiments↔bandit 循环依赖）。
 */

import { EXPERIMENT_ID, VARIANTS, currentAllocation, banditState } from "./bandit";

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
  const weights =
    currentAllocation() ?? // Phase 9：bandit 治理分配（adaptive 模式生效）
    Object.fromEntries(VARIANTS.map((v) => [v.id, v.weight])); // fixed/manual：静态权重
  const bucket = fnv1a(EXPERIMENT_ID + "|" + sessionId) % 100;
  let acc = 0;
  for (const v of VARIANTS) {
    acc += weights[v.id] ?? v.weight;
    if (bucket < acc) return v.id;
  }
  return "baseline";
}

/** 实验元信息（看板展示）—— Phase 9 起含治理状态（当前分配/champion/最近裁决） */
export function experimentMeta() {
  const state = banditState();
  const allocation =
    currentAllocation() ?? Object.fromEntries(VARIANTS.map((v) => [v.id, v.weight]));
  return {
    id: EXPERIMENT_ID,
    variants: VARIANTS.map((v) => v.id),
    allocation,
    governance: { mode: state.mode, champion: state.champion, verdict: state.verdict, retired: state.retired, evaluations: state.evaluations },
  };
}
