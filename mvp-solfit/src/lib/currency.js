/**
 * lib/currency.js — 多币种（方案文档 §7.1）
 * 原则：内部金额恒为 USD（角位精度），仅展示层转换；下单时快照 {currency, fxRate}。
 * TODO(Phase 1.5): 心理定价本地化价目表（$99/€89/£79）+ 每日汇率刷新（ECB feed / 支付网关 API）
 */

import { getSiteSettings } from "@/lib/site-settings";

export const FX_RATES = { USD: 1, EUR: 0.92, GBP: 0.79 };

export const CURRENCIES = [
  { code: "USD", symbol: "$", label: "USD $" },
  { code: "EUR", symbol: "€", label: "EUR €" },
  { code: "GBP", symbol: "£", label: "GBP £" },
];

/** 展示格式化：非美元四舍五入到整数（心理定价雏形） */
export function formatMoney(usd, currency = "USD") {
  return formatMoneyFromRate(usd, currency, FX_RATES[currency] ?? 1);
}

/** 用下单时快照汇率格式化（订单页使用，防止后续汇率漂移改变历史订单展示） */
export function formatMoneyFromRate(usd, currency = "USD", rate = 1) {
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol || "$";
  const value = usd * rate;
  if (currency === "USD") return symbol + value.toFixed(2).replace(/\.00$/, "");
  return symbol + Math.round(value);
}

/** 服务端组件读货币偏好（cookie: solfit_currency；未设回落总后台站点设置） */
export function getCurrencyFromCookies(cookieStore) {
  const c = cookieStore?.get?.("solfit_currency")?.value;
  if (FX_RATES[c]) return c;
  const def = getSiteSettings().defaultCurrency;
  return FX_RATES[def] ? def : "USD";
}
