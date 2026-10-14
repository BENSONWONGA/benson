/**
 * lib/track.js — 客户端埋点（方案文档 §7.3：第一天埋对点）
 *
 * GDPR 合规：scope="analytics" 的事件仅在用户同意（CookieConsent granted）后上报；
 * scope="necessary"（订单履约链路）无需同意即可上报。
 * 服务端事件直接走 lib/db.trackEvent —— 两端事件名使用同一套 snake_case 规范：
 *   product_viewed / cart_added / cart_updated / checkout_started /
 *   order_created / order_exchanged / fit_profile_saved / profile_erased /
 *   ai_size_recommended / ai_stylist_message / recommend_served
 */

const CONSENT_KEY = "solfit_consent";

export function getConsent() {
  try { return localStorage.getItem(CONSENT_KEY); } catch { return null; } // granted | essential | null
}

export function setConsent(value) {
  try {
    localStorage.setItem(CONSENT_KEY, value);
    localStorage.setItem(CONSENT_KEY + "_ts", new Date().toISOString());
  } catch { /* 隐私模式下静默 */ }
}

/** 客户端事件上报（sendBeacon 优先，页面卸载也不丢） */
export function track(name, props = {}, scope = "analytics") {
  if (scope === "analytics" && getConsent() !== "granted") return;
  const body = JSON.stringify({ events: [{ name, props, ts: new Date().toISOString() }] });
  try {
    if (navigator.sendBeacon) return navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch { /* 埋点绝不阻塞业务 */ }
}
