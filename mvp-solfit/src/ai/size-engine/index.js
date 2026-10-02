/**
 * ai/size-engine — AI 尺码推荐服务（P0 · 护城河）
 *
 * 演进路线（与方案文档 §5.1 对齐）：
 *   V1（当前）: 问卷 + 品牌尺码转换 + 楦型库规则
 *   V2: 手机拍照量脚（CV 测脚长/宽/脚背 → 匹配楦型库）
 *   V3: 退货/换码数据回流 → 协同过滤 + 脚型特征模型
 *
 * 接口不变式：recommendSize(profile) 的输入输出形状保持稳定，
 * 内部实现从规则升级到模型时调用方（API/PDP）零改动。
 */

import { LAST_LIBRARY, getProduct } from "@/modules/catalog/service";
import { trackEvent } from "@/lib/db";

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

  const inStock = product.sizes.filter((s) => !product.oos.includes(s));
  const nearest = inStock.reduce((best, s) =>
    best === null || Math.abs(parseFloat(s) - adjusted) < Math.abs(parseFloat(best) - adjusted) ? s : best, null);

  return {
    ...rec,
    productAdjustment: { lastCode: product.lastCode, runs: last.runs, note: last.widthNote },
    finalSize: nearest,
    exactMatch: nearest !== null && Math.abs(parseFloat(nearest) - adjusted) < 0.26,
  };
}
