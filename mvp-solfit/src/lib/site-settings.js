/**
 * lib/site-settings — 站点级设置（Phase 22 · 总后台）
 *
 * 独立纯内存模块（不引 next/headers / db.js），原因：currency.js / i18n.js
 * 被客户端组件复用（CurrencySwitcher / LanguageSwitcher 引用其常量），
 * 必须保持客户端可打包；而"默认货币 / 默认语言"的回落值要读这里。
 * 进程内单例 —— 与 db.js stores 同生命周期；Phase 2 迁 PG site_settings 表。
 *
 * 字段（全部站点级，唯一写入口：总后台 POST /api/master/settings）：
 *   siteName         店铺名称
 *   announcement     公告栏文案（空串 = 隐藏公告栏）
 *   defaultCurrency  默认货币（USD/EUR/GBP —— cookie 未设访客的回落值）
 *   defaultLang      默认语言（en/zh）
 *   maintenance      维护模式（true = 前台维护横幅 + 结算下单闸门关闭）
 */

export const DEFAULT_SETTINGS = {
  siteName: "SOLFIT",
  announcement: "Free size exchanges on every order — the SOLFIT Fit Guarantee",
  defaultCurrency: "USD",
  defaultLang: "en",
  maintenance: false,
};

const _settings = new Map(); // key "site" -> 覆盖层（浅合并 DEFAULT_SETTINGS）

export function getSiteSettings() {
  const saved = _settings.get("site") || {};
  return { ...DEFAULT_SETTINGS, ...saved };
}

/** 保存整份设置（master 域 updateSiteSettings 校验后调用） */
export function saveSiteSettings(next) {
  _settings.set("site", { ...getSiteSettings(), ...next });
  return getSiteSettings();
}
