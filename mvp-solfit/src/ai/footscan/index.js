/**
 * ai/footscan — 拍照量脚引擎（V2 骨架 · 方案文档 §5.1 演进路线）
 *
 * 数据流：照片（+卡片参照物）→ 尺寸解析 → 测量值 → EU 尺码/宽窄 →
 * 楦型校验（复用 size-engine 的商品级 finalSize 逻辑）→ 脚型档案沉淀。
 *
 * 骨架期约定（与 size-engine 同款诚实边界）：
 *   * 真实 CV 模型（脚部关键点检测）未接入 —— 照片路径用内容哈希种子的
 *     确定性伪测量替代，confidence 上限 78、model 带 skeleton 标记，
 *     前台明示"扫描结果请以试穿为准"。
 *   * 手动卷尺测量值优先于伪测量（这是真实数据），confidence 93。
 *   * 照片本身不落库不进事件管道（GDPR：图像属敏感生物特征），
 *     只埋 ai_foot_scan {confidence, model} 审计事件。
 *   * 接口不变式：scanFoot 输入输出形状稳定，换真模型时调用方零改动。
 */

import { trackEvent } from "@/lib/db";

const MODEL_SKELETON = "footscan-skeleton-v0";
const MODEL_MANUAL = "manual-caliper";

/** 参照物默认长边：标准信用卡 85.6mm（ISO/IEC 7810 ID-1） */
export const REFERENCE_CARD_MM = 85.6;

// ===== 图片尺寸解析（零依赖：PNG/JPEG/GIF 头部直读）=====

export function imageMeta(buf) {
  const b = Buffer.from(buf);
  // PNG: 8B 签名 + IHDR，width/height 在 offset 16/20（big-endian）
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { format: "png", width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  // JPEG: 扫 SOFn 标记段（FF C0-CF，除 C4/C8/CC）
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const isSOF = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSOF) return { format: "jpeg", height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2); // 跳过本段
    }
  }
  // GIF: 逻辑屏幕尺寸在 offset 6（little-endian）
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { format: "gif", width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  }
  return { format: "unknown", width: 0, height: 0 };
}

/** 内容哈希种子（确定性 —— 同一张照片重扫结果一致，便于演示与调试） */
function contentSeed(buf) {
  const b = Buffer.from(buf);
  let h = 2166136261;
  const step = Math.max(1, Math.floor(b.length / 1024)); // 抽样 1KB，照片几 MB 也不吃 CPU
  for (let i = 0; i < b.length; i += step) {
    h ^= b[i];
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG —— 确定性伪随机（骨架期替真实 CV 输出） */
function prng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ===== 测量 → 尺码（Paris point：1 EU 码 = 2/3 cm）=====

/** 脚长 → EU 码：+15mm 趾仓余量（行业常规 0.5–1cm），0.5 码粒度 */
export function lengthToEu(lengthCm) {
  const eu = (lengthCm * 10 + 15) / (20 / 3);
  return Math.min(46, Math.max(35, Math.round(eu * 2) / 2));
}

/** 宽长比 → 宽窄档（楦型库口径：Wide > 0.40，Narrow < 0.36） */
export function ratioToWidth(lengthCm, widthCm) {
  const r = widthCm / lengthCm;
  return r > 0.4 ? "Wide" : r < 0.36 ? "Narrow" : "Standard";
}

/**
 * 扫描主入口。
 * @param {object} p
 * @param {Buffer} p.photo 照片字节（不落库，仅过流）
 * @param {number} [p.referenceMm] 参照物长边 mm（默认信用卡 85.6）
 * @param {number} [p.manualLengthCm] 手动卷尺脚长（提供则优先于伪测量）
 * @param {number} [p.manualWidthCm] 手动卷尺脚宽
 * @returns 测量结果 + 尺码/宽窄/置信度（与 size-engine rec 形状对齐）
 */
export function scanFoot({ photo, referenceMm = REFERENCE_CARD_MM, manualLengthCm, manualWidthCm } = {}) {
  const hasManual = Number(manualLengthCm) > 0;
  let measurements, source, model, confidence;

  if (hasManual) {
    // 手动测量是真实数据（卷尺口径）—— 优先于照片伪测量
    const length = +Number(manualLengthCm).toFixed(1);
    const width = Number(manualWidthCm) > 0 ? +Number(manualWidthCm).toFixed(1) : +(length * 0.38).toFixed(1);
    measurements = { lengthCm: length, widthCm: width };
    source = "manual";
    model = MODEL_MANUAL;
    confidence = 93;
  } else {
    if (!photo || !photo.length) throw new Error("PHOTO_REQUIRED");
    const meta = imageMeta(photo);
    if (meta.format === "unknown") throw new Error("UNSUPPORTED_IMAGE");

    // 骨架伪测量：成人脚长 22.5–29.5cm 的合理区间，内容哈希确定性生成。
    // 参照物刻度参与种子（换不同 referenceMm 结果可复算）—— 真 CV 接入后本段整体替换。
    const rand = prng(contentSeed(photo) ^ Math.round(referenceMm * 7));
    const length = +(22.5 + rand() * 7).toFixed(1);
    const width = +(length * (0.345 + rand() * 0.075)).toFixed(1);
    measurements = { lengthCm: length, widthCm: width, imagePx: meta.width && meta.height ? `${meta.width}×${meta.height}` : undefined };
    source = "photo";
    model = MODEL_SKELETON;
    confidence = 68 + Math.round(rand() * 10); // 骨架置信度封顶 78 —— 明示不如卷尺准
  }

  const size = lengthToEu(measurements.lengthCm);
  const width = ratioToWidth(measurements.lengthCm, measurements.widthCm);

  trackEvent("ai_foot_scan", { confidence, model });

  return {
    size: String(size % 1 === 0 ? size : size.toFixed(1)),
    width,
    confidence,
    measurements,
    source,
    model,
    reason:
      source === "manual"
        ? `Measured ${measurements.lengthCm} cm heel-to-toe — that maps to EU ${size} with standard toe room. Width ratio puts you in ${width}.`
        : `Photo scan reads ${measurements.lengthCm} cm — EU ${size} with toe room included. Width reads ${width}. (Skeleton scanner: verify with a tape or the questionnaire.)`,
  };
}
