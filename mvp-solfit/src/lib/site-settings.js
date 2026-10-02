/**
 * lib/site-settings — 站点级设置（Phase 22 总后台 · Phase 23 品牌与 SEO 扩展）
 *
 * 独立纯内存模块（不引 next/headers / db.js），原因：currency.js / i18n.js
 * 被客户端组件复用（CurrencySwitcher / LanguageSwitcher 引用其常量），
 * 必须保持客户端可打包；而"默认货币 / 默认语言 / 站点主题"的回落值要读这里。
 * 进程内单例 —— 与 db.js stores 同生命周期；Phase 2 迁 PG site_settings 表。
 *
 * 字段分三组（写入口各不相同）：
 *   基础（总后台 POST /api/master/settings —— updateSiteSettings in master 域）：
 *     siteName / announcement / defaultCurrency / defaultLang / maintenance
 *   品牌与装修（商家后台 POST /api/admin/settings action=theme|homepage）：
 *     theme            站点默认主题（10 套 UI 模板之一，访客未选 cookie 时的门面）
 *     themeLocked      锁定全站主题（true = 访客 cookie 自选失效，全站统一门面）
 *     homeHeroImage    首页主图 URL（空 = 内置默认图）
 *     homeContent      首页文案覆盖 {en:{}, zh:{}}（hero 标题/副标题/按钮/区块标题）
 *   SEO（商家后台 POST /api/admin/settings action=seo）：
 *     seo              {title, description, keywords} —— 首页 meta（空 = 默认）
 */

export const DEFAULT_SETTINGS = {
  siteName: "SOLFIT",
  announcement: "Free size exchanges on every order — the SOLFIT Fit Guarantee",
  defaultCurrency: "USD",
  defaultLang: "en",
  maintenance: false,
  // ===== 品牌（Phase 23 商家后台可改）=====
  theme: "solfit",
  themeLocked: false,
  homeHeroImage: "",
  homeContent: { en: {}, zh: {} },
  // ===== SEO（Phase 23 商家后台可改）=====
  seo: { title: "", description: "", keywords: "" },
};

const _settings = new Map(); // key "site" -> 覆盖层（浅合并 DEFAULT_SETTINGS）

export function getSiteSettings() {
  const saved = _settings.get("site") || {};
  const s = { ...DEFAULT_SETTINGS, ...saved };
  // 深层默认兜底（保存层可能缺 homeContent/seo 子对象）
  s.homeContent = { en: {}, zh: {}, ...(saved.homeContent || {}) };
  s.seo = { ...DEFAULT_SETTINGS.seo, ...(saved.seo || {}) };
  return s;
}

/** 保存整份设置（校验函数调用；master 域 updateSiteSettings 也走这里） */
export function saveSiteSettings(next) {
  _settings.set("site", { ...getSiteSettings(), ...next });
  return getSiteSettings();
}

// ===== 主题白名单（与 lib/themes.js THEMES 的 10 个 id 同源；此处内联避免循环 import）=====

const THEME_IDS = [
  "solfit", "noir", "blush", "azure", "terracotta",
  "forest", "minimal", "editorial", "midnight", "sakura",
];

/** 首页文案可装修字段（两语言同构）—— 与 app/page.jsx HOME_TEXT 消费的字段对齐 */
const HOME_FIELDS = [
  ["heroEyebrow", 60],
  ["heroH1", 120],
  ["heroLede", 400],
  ["ctaFind", 60],
  ["ctaShop", 60],
  ["recH2", 80],
  ["topH2", 80],
];

/** 清洗单语言文案包：只留白名单字段、去首尾空白、空串剔除（= 回落默认文案） */
function cleanHomePack(pack) {
  const out = {};
  if (!pack || typeof pack !== "object") return out;
  for (const [field, max] of HOME_FIELDS) {
    const v = String(pack[field] ?? "").trim().slice(0, max);
    if (v) out[field] = v;
  }
  return out;
}

/**
 * 品牌与首页装修（商家后台）—— {action:"theme", theme, themeLocked}
 * 与 {action:"homepage", homeContent, homeHeroImage} 共用本入口。
 * @returns {{settings, changed: string[]}} changed 为中文标签（审计与前端提示共用）
 */
export function updateBrandingSettings(patch = {}) {
  const cur = getSiteSettings();
  const next = { ...cur };
  const changed = [];

  if (patch.theme !== undefined) {
    const v = String(patch.theme);
    if (THEME_IDS.includes(v) && v !== cur.theme) { next.theme = v; changed.push("站点主题"); }
  }
  if (patch.themeLocked !== undefined) {
    const v = patch.themeLocked === true || patch.themeLocked === "true";
    if (v !== cur.themeLocked) { next.themeLocked = v; changed.push(v ? "锁定主题" : "解锁主题"); }
  }
  if (patch.homeHeroImage !== undefined) {
    const v = String(patch.homeHeroImage || "").trim().slice(0, 500);
    if (v !== cur.homeHeroImage) { next.homeHeroImage = v; changed.push("首页主图"); }
  }
  if (patch.homeContent !== undefined) {
    const en = cleanHomePack(patch.homeContent?.en);
    const zh = cleanHomePack(patch.homeContent?.zh);
    if (JSON.stringify(en) !== JSON.stringify(cur.homeContent.en) ||
        JSON.stringify(zh) !== JSON.stringify(cur.homeContent.zh)) {
      next.homeContent = { en, zh };
      changed.push("首页文案");
    }
  }

  if (changed.length) saveSiteSettings(next);
  return { settings: getSiteSettings(), changed };
}

/** SEO 设置（商家后台）—— 首页 meta 标题/描述/关键词 */
export function updateSeoSettings(patch = {}) {
  const cur = getSiteSettings();
  const next = { ...cur };
  const seo = { ...cur.seo };
  const changed = [];

  const fields = [["title", 120], ["description", 320], ["keywords", 200]];
  for (const [k, max] of fields) {
    if (patch[k] !== undefined) {
      const v = String(patch[k] ?? "").trim().slice(0, max);
      if (v !== seo[k]) { seo[k] = v; changed.push(`SEO ${k === "title" ? "标题" : k === "description" ? "描述" : "关键词"}`); }
    }
  }

  if (changed.length) { next.seo = seo; saveSiteSettings(next); }
  return { settings: getSiteSettings(), changed };
}
