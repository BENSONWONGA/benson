/**
 * ai/size-engine — AI 尺码推荐服务（P0 · 护城河）
 *
 * 演进路线（与方案文档 §5.1 对齐）：
 *   V1: 问卷 + 品牌尺码转换 + 楦型库规则（静态规则）
 *   V2: 手机拍照量脚（CV 测脚长/宽/脚背 → 匹配楦型库）
 *   V3（当前）: 换货回流样本按楦型聚合，样本足量时以真实数据修正静态规则
 *
 * 接口不变式：recommendSize(profile) 的输入输出形状保持稳定，
 * 内部实现从规则升级到模型时调用方（API/PDP）零改动。
 */

import { LAST_LIBRARY, getProduct } from "@/modules/catalog/service";
import { trackEvent, store } from "@/lib/db";

const BRAND_ADJ = { Nike: 0, Adidas: -0.5, "New Balance": 0, Vionic: 0, Other: 0 };
const WIDTH_ADJ = { Narrow: -0.25, Standard: 0, Wide: 0.25 };

export function recommendSize(profile) {
  const { usualSize, usualBrand, widthFeel, footNotes = [] } = profile;

  const base = parseFloat(usualSize);
  if (!base || base < 30 || base > 48) throw new Error("INVALID_PROFILE_SIZE");

  let size = base
    + (BRAND_ADJ[usualBrand] ?? 0)
    + (WIDTH_ADJ[widthFeel] ?? 0)
    + (footNotes.includes("High arch") ? 0.5 : 0);
  size = Math.min(42.5, Math.max(35, Math.round(size * 2) / 2));

  const width = widthFeel === "Wide" ? "Wide" : "Standard";
  const measurements = {
    // V2 接入点：这里换 CV 模型输出的真实测量值
    length: +(21.8 + (size - 35) * 0.58).toFixed(1),
    width: +(width === "Wide" ? 10.2 : 8.9).toFixed(1),
    instep: footNotes.includes("High arch") ? "High" : "Normal",
  };
  const confidence = widthFeel === "Standard" && !footNotes.length ? 94 : 89; // 规则版置信度（V3 换模型输出）

  trackEvent("ai_size_recommended", { profile, size, width, confidence });

  return {
    size: String(size % 1 === 0 ? size : size.toFixed(1)),
    width,
    confidence,
    measurements,
    reason:
      width === "Wide"
        ? `Based on your ${usualBrand} ${usualSize} history and a wider forefoot pattern, we suggest Wide width — our W-last gives your toes 8mm more room.`
        : `Your ${usualBrand} ${usualSize} history maps cleanly onto our lasts. Stay at your usual size in Standard width.`,
  };
}

/**
 * V3：楦型偏码统计 —— 从换货回流样本（fit_training_set）按楦型聚合
 * 样本量达阈值且偏码方向明确时，用真实换码数据修正静态楦型规则 ——
 * 这是退货数据回流的闭环终点（applyExchange → 样本 → 本函数 → 推荐修正）。
 * Phase 4 换 PG 聚合查询/离线任务，本函数签名不变。
 */
const DATA_MIN_SAMPLES = 5; // 样本不足时宁可用静态规则，不用噪声数据
const DATA_BIAS_RATIO = 0.6; // 60% 以上同向偏码才修正

export function lastCodeAdjustments() {
  const agg = {};
  for (const s of store("fitTrainingSet")) {
    if (!s.lastCode) continue;
    const a = agg[s.lastCode] || (agg[s.lastCode] = { samples: 0, tooSmall: 0, tooLarge: 0 });
    a.samples++;
    if (s.reason === "too_small") a.tooSmall++;
    if (s.reason === "too_large") a.tooLarge++;
  }
  return agg;
}

/**
 * 将推荐结果落到具体楦型 —— 让 AI 推荐与商品事实双向校验
 * 例：Emmeline(H1) runs small => 宽脚推荐自动 +0.5 码
 */
export async function recommendSizeForProduct(profile, productId) {
  const product = await getProduct(productId);
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  const rec = recommendSize(profile);
  const last = LAST_LIBRARY[product.lastCode] || { runs: "true" };

  let adjusted = parseFloat(rec.size);
  if (last.runs === "small" && rec.width === "Wide") adjusted += 0.5;
  if (last.runs === "generous" || last.runs === "generous-socks") adjusted -= 0.5;

  // V3 数据驱动修正：真实换码方向覆盖静态经验值（样本足量时）
  const stats = lastCodeAdjustments()[product.lastCode];
  let dataNote = null;
  if (stats && stats.samples >= DATA_MIN_SAMPLES) {
    if (stats.tooSmall / stats.samples >= DATA_BIAS_RATIO) {
      adjusted += 0.5;
      dataNote = `${stats.samples} recent exchanges say last ${product.lastCode} runs small — sized you up half`;
    } else if (stats.tooLarge / stats.samples >= DATA_BIAS_RATIO) {
      adjusted -= 0.5;
      dataNote = `${stats.samples} recent exchanges say last ${product.lastCode} runs large — sized you down half`;
    }
  }

  const inStock = product.sizes.filter((s) => !product.oos.includes(s));
  // 距离平手时向上取 —— "sized you up half" 后落在原码会让数据修正自相矛盾
  const nearest = inStock.reduce((best, s) => {
    if (best === null) return s;
    const d = Math.abs(parseFloat(s) - adjusted);
    const db = Math.abs(parseFloat(best) - adjusted);
    return d < db || (d === db && parseFloat(s) > parseFloat(best)) ? s : best;
  }, null);

  return {
    ...rec,
    productAdjustment: {
      lastCode: product.lastCode,
      runs: last.runs,
      note: last.widthNote,
      dataNote, // 非空 = 数据驱动修正已生效（调试与前端可解释性）
      samples: stats?.samples ?? 0,
    },
    finalSize: nearest,
    exactMatch: nearest !== null && Math.abs(parseFloat(nearest) - adjusted) < 0.26,
  };
}
