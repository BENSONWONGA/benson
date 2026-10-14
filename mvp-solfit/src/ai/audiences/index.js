/**
 * ai/audiences — 广告受众引擎（Phase 8 独立模块）
 *
 * 触达侧闭环的最后一环（方案文档 §5.1）：
 *   on-site 推荐(Phase 3/5) → 邮件召回(Phase 6/7) → 广告人群(本模块)
 * 广告平台不会直接调用我们 —— 本模块把一方数据变成平台能吃的受众资产：
 *   预览（脱敏）→ 导出（Meta/Google 规范 CSV，SHA-256 哈希邮箱）→ 审计
 *
 * 合规要点（GDPR / 平台政策）：
 *   - 导出邮箱与邮件营销同资格口径（显式订阅 / 复购订单，resolveAddress）
 *   - CSV 只含哈希邮箱（Meta/Google Customer Match 规范，也是最小化原则）
 *   - 审计记录只存 {platform, segmentId, size}（哈希不可逆，计数非 PII）
 *   - erase 后订阅/订单/事件三清 → 会话出列，无残留副本
 *
 * 演进：Phase 9+ 接平台 Marketing API 服务端直连（Meta /api/act_<id>/customaudiences），
 *       本模块的 buildAudiences/export 签名不变，只换投递通道。
 */

import { createHash } from "crypto";
import { store, trackEvent } from "@/lib/db";
import { buildAudiences, getAudience } from "./segments";

/** 邮箱规范化（Meta/Google 规范：去空格 + 小写后哈希） */
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/** SHA-256 十六进制哈希（平台 Custom Audience 通行格式） */
function emailHash(email) {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function mask(email) {
  if (!email) return null;
  const [name, domain] = email.split("@");
  return name?.slice(0, 2) + "***@" + domain;
}

/**
 * 人群预览（运营 API / 监控看板用）：
 * 全部会话可见，邮箱脱敏；maxEntries 限制预览条数（人群可很大）。
 */
export function audiencesPreview({ maxEntries = 10 } = {}) {
  const segments = buildAudiences().map((a) => ({
    id: a.id,
    purpose: a.purpose,
    size: a.size,
    withEmail: a.withEmail,
    sample: a.entries.slice(0, maxEntries).map((e) => ({
      sessionId: e.sessionId,
      email: mask(e.email),
      emailSource: e.emailSource,
      tier: e.tier || null,
      value: e.value || null,
      viewedProductIds: e.viewedProductIds || undefined,
      cartProductIds: e.cartProductIds || undefined,
      topCategory: e.topCategory || undefined,
    })),
  }));
  return { enabled: true, segments };
}

/**
 * 人群导出 —— 广告平台摄入格式：
 *   meta / google : CSV（首行 email 列头 + SHA-256 哈希行）—— Custom Audience / Customer Match 规范
 *   json          : 全字段（含 DPA 商品清单与价值分）—— 自定义平台或数仓中转
 *
 * @param {{segmentId: string, platform: "meta"|"google"|"json", top?: number}} opts
 *   top 仅对 lookalike_seed 有意义（按价值分截断种子规模 —— 平台种子 1k–50k 最佳）
 * @returns {{csv?: string, payload?: object, meta: object}}
 */
export function exportAudience({ segmentId, platform = "json", top } = {}) {
  const audience = getAudience(segmentId);
  if (!audience) return { error: "SEGMENT_NOT_FOUND" };

  let entries = audience.entries.filter((e) => e.email); // 只有可解析邮箱的会话才可导出
  if (segmentId === "lookalike_seed" && top > 0) {
    entries = entries.slice(0, top); // entries 已按价值分降序（segments.js 保证）
  }
  if (!entries.length) return { error: "EMPTY_AUDIENCE" };

  const meta = {
    segmentId,
    platform,
    requested: entries.length,
    exportedAt: new Date().toISOString(),
  };

  // 审计（计数级，无 PII）—— GDPR 问责制要求"导出过什么给谁"可追溯
  const audit = { ...meta, size: entries.length };
  const exports = store("audienceExports");
  exports.push(audit);
  while (exports.length > 200) exports.shift(); // 滚动窗口，防无限增长
  trackEvent("audience_exported", { platform, segmentId, size: entries.length });

  if (platform === "meta" || platform === "google") {
    const csv = ["email", ...entries.map((e) => emailHash(e.email))].join("\n");
    return { csv, meta };
  }

  // json：DPA 素材与种子价值分全量携带（哈希邮箱 —— 下游只认哈希）
  return {
    payload: {
      ...meta,
      entries: entries.map((e) => ({
        emailHash: emailHash(e.email),
        tier: e.tier || undefined,
        value: e.value || undefined,
        viewedProductIds: e.viewedProductIds || undefined,
        cartProductIds: e.cartProductIds || undefined,
        topCategory: e.topCategory || undefined,
      })),
    },
    meta,
  };
}

/** 域健康快照 —— 监控看板（人群规模 + 最近导出审计） */
export function audienceStats() {
  const segments = buildAudiences().map((a) => ({ id: a.id, size: a.size, withEmail: a.withEmail }));
  const exports = store("audienceExports");
  return {
    segments,
    exportsTotal: exports.length,
    lastExport: exports[exports.length - 1] || null,
  };
}
