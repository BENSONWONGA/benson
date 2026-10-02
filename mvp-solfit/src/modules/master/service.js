/**
 * modules/master — 总后台域（Phase 22 · 老板/超管级）
 *
 * 与商家后台（merchant 域，员工日常操作）分层：
 *   - 总后台管"人"与"站"：员工令牌签发/吊销、站点级设置、审计日志、系统健康
 *   - 商家后台管"货"与"单"：订单/库存/商品/优惠码/内容/评价/会员
 *
 * 令牌体系（两级）：
 *   1) 超管令牌 MASTER_TOKEN（env，默认 dev-master-token）—— 只属于老板，
 *      骨架期兜底；生产必改（与 ADMIN_TOKEN 同款约定）
 *   2) 员工令牌（本域签发，st_ 前缀）—— 员工在商家后台 /admin/merchant
 *      用它登录（merchant 域 isAdmin 已接入本域 findActiveStaffByToken）；
 *      role=owner 的签发令牌可进总后台（给合伙人开权限）
 *
 * 审计：总后台自身操作（本域路由）+ 商家后台关键写操作（admin 路由层
 * auditAdmin 钩子）。内存留最近 200 条；Phase 2 迁 PG audit_logs 表。
 */

import { randomBytes, timingSafeEqual } from "crypto";
import { store } from "@/lib/db";
import { getSiteSettings, saveSiteSettings } from "@/lib/site-settings";
import { pipelineStats } from "@/lib/pipeline";
import { alertsState } from "@/lib/alerts";
import { listProducts } from "@/modules/catalog/service";
import { FX_RATES } from "@/lib/currency";
import { LANGS } from "@/lib/i18n";

const ROLES = ["owner", "staff"];
const AUDIT_CAP = 200;

/** 恒时比较（与 merchant 域同款，防时序侧信道） */
function tokensMatch(a, b) {
  const ba = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

const masterToken = () => process.env.MASTER_TOKEN || "dev-master-token";

// ===== 鉴权 =====

/** 令牌 → 在职员工（顺带刷新 lastUsedAt —— 总后台可见"谁在用"） */
export function findActiveStaffByToken(token) {
  if (!token) return null;
  for (const st of store("staffTokens").values()) {
    if (st.status === "active" && tokensMatch(token, st.token)) {
      st.lastUsedAt = new Date().toISOString();
      return st;
    }
  }
  return null;
}

/**
 * 总后台门禁：MASTER_TOKEN（env）或本域签发的 owner 令牌。
 * @returns {{ok: boolean, name?: string}} 通过时附操作者名（审计用）
 */
export function isMaster(request) {
  const url = new URL(request.url);
  const token = request.headers.get("x-master-token") || url.searchParams.get("master_token") || "";
  if (tokensMatch(token, masterToken())) return { ok: true, name: "初始超管" };
  const st = findActiveStaffByToken(token);
  if (st && st.role === "owner") return { ok: true, name: st.name };
  return { ok: false };
}

// ===== 员工令牌管理 =====

/**
 * 签发员工令牌 —— 完整令牌只在创建响应里出现一次（列表只出预览）。
 * 员工拿它去商家后台登录；吊销即时生效（merchant isAdmin 每请求实时查）。
 */
export function createStaffToken({ name, role = "staff", note = "" } = {}) {
  const cleanName = String(name || "").trim().slice(0, 24);
  if (!cleanName) throw new Error("NAME_REQUIRED");
  if (!ROLES.includes(role)) throw new Error("INVALID_ROLE");
  const rec = {
    id: "t_" + Date.now().toString(36) + randomBytes(2).toString("hex"),
    name: cleanName,
    role,
    note: String(note || "").trim().slice(0, 60),
    token: "st_" + randomBytes(18).toString("hex"),
    status: "active",
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  store("staffTokens").set(rec.id, rec);
  return rec;
}

/** 吊销（幂等）：吊销后商家后台立即失效 */
export function revokeStaffToken(id) {
  const rec = store("staffTokens").get(id);
  if (!rec) throw new Error("TOKEN_NOT_FOUND");
  if (rec.status !== "revoked") {
    rec.status = "revoked";
    rec.revokedAt = new Date().toISOString();
  }
  return rec;
}

/** 员工列表（完整令牌不二次下发，只出预览） */
export function listStaff() {
  return [...store("staffTokens").values()]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(({ token, ...rest }) => ({ ...rest, tokenPreview: token.slice(0, 8) + "…" + token.slice(-4) }));
}

// ===== 站点设置 =====

/**
 * 设置白名单与校验（写入唯一入口）—— 返回 { settings, changed }，
 * changed 为中文标签数组（审计日志与前端提示共用）。
 */
export function updateSiteSettings(patch = {}) {
  const cur = getSiteSettings();
  const next = { ...cur };
  const changed = [];

  if (patch.siteName !== undefined) {
    const v = String(patch.siteName).trim().slice(0, 40);
    if (v && v !== cur.siteName) { next.siteName = v; changed.push("店铺名称"); }
  }
  if (patch.announcement !== undefined) {
    const v = String(patch.announcement).trim().slice(0, 160); // 空串 = 隐藏公告栏
    if (v !== cur.announcement) { next.announcement = v; changed.push("公告栏"); }
  }
  if (patch.defaultCurrency !== undefined) {
    const v = String(patch.defaultCurrency).toUpperCase();
    if (FX_RATES[v] && v !== cur.defaultCurrency) { next.defaultCurrency = v; changed.push("默认货币"); }
  }
  if (patch.defaultLang !== undefined) {
    const v = String(patch.defaultLang).toLowerCase();
    if (LANGS.some(([code]) => code === v) && v !== cur.defaultLang) { next.defaultLang = v; changed.push("默认语言"); }
  }
  if (patch.maintenance !== undefined) {
    const v = patch.maintenance === true || patch.maintenance === "true";
    if (v !== cur.maintenance) { next.maintenance = v; changed.push("维护模式"); }
  }

  if (changed.length) saveSiteSettings(next);
  return { settings: getSiteSettings(), changed };
}

// ===== 审计日志 =====

export function audit(actor, action, detail = null) {
  const logs = store("auditLogs");
  logs.push({ at: new Date().toISOString(), actor, action, detail });
  if (logs.length > AUDIT_CAP) logs.shift();
}

/** 请求 → 操作者（超管令牌 / 员工令牌 → 名字；都不匹配则"未知"） */
export function resolveActor(request) {
  const url = new URL(request.url);
  const candidates = [
    request.headers.get("x-master-token") || url.searchParams.get("master_token"),
    request.headers.get("x-admin-token") || url.searchParams.get("token"),
  ];
  for (const token of candidates) {
    if (!token) continue;
    if (tokensMatch(token, masterToken())) return "初始超管";
    const st = findActiveStaffByToken(token);
    if (st) return st.name;
  }
  return "未知";
}

/** 后台写操作审计入口（actor 从请求令牌解析；商家/总后台路由共用） */
export function auditAdmin(action, detail, request) {
  audit(resolveActor(request), action, detail);
}

export function listAuditLogs(limit = 120) {
  return [...store("auditLogs")].reverse().slice(0, limit);
}

// ===== 系统健康 =====

/** 总后台健康快照（与 /api/health 同源检查 + 告警状态聚合） */
export function masterHealth() {
  const pipeline = pipelineStats();
  const products = listProducts();
  const alerts = alertsState();
  const eventsDepth = store("events").length;
  const fitSamples = store("fitTrainingSet").length;

  const checks = {
    catalog: products.length > 0,
    pipeline: pipeline.discarded < 1000,
    eventsBuffer: eventsDepth < 1000,
  };
  return {
    status: Object.values(checks).every(Boolean) ? "ok" : "degraded",
    checks,
    uptimeSec: Math.round(process.uptime()),
    node: process.version,
    env: process.env.NODE_ENV || "development",
    products: products.length,
    eventsDepth,
    fitSamples,
    pipeline,
    alerts: { active: alerts.active, count: alerts.active.length },
  };
}
