/**
 * lib/i18n — 多语言（骨架期：首页全量文案；Phase 2 铺开全站 + locale 路由 + hreflang）
 *
 * 机制：cookie `solfit_lang` 驱动 SSR（与货币/主题同款偏好持久化）。
 * 不引 i18n 框架 —— 文案集中一处、零依赖（自研边界铁律）；
 * Phase 2 迁 /zh /en 路由时本字典成为提取源。
 * 默认语言回落总后台站点设置（lib/site-settings —— 保持本文件客户端可打包）。
 */

import { getSiteSettings } from "@/lib/site-settings";

export const DEFAULT_LANG = "en";
export const LANGS = [
  ["en", "English"],
  ["zh", "中文"],
];

/** 首页文案字典（商品名/类目等业务数据不翻 —— 数据层多语言是 Phase 2 PG 建模范畴） */
export const HOME_TEXT = {
  en: {
    heroEyebrow: "AI-fitted footwear",
    heroH1: "The pair that fits. Guaranteed.",
    heroLede: "63% of people wear the wrong shoe size. Our AI reads your feet in 60 seconds and matches them to our lasts — with a free-exchange guarantee behind every pair.",
    ctaFind: "Find my size — 60 sec",
    ctaShop: "Shop the collection",
    heroAlt: "Woman walking in cream SOLFIT sneakers",
    recEyebrow: "AI recommendations",
    recH2: "Fitted for you this week",
    topEyebrow: "Top rated",
    topH2: "Most fitted, most loved",
    themeEyebrow: "Store look",
    themeTitle: "Store themes",
    themeHint: "10 looks, one store — your choice sticks on this device.",
  },
  zh: {
    heroEyebrow: "AI 量脚选鞋",
    heroH1: "合脚的那双，保证合适。",
    heroLede: "63% 的人穿着错误的鞋码。我们的 AI 在 60 秒内读取你的脚型，匹配专属楦型 —— 每一双都附带免费换码保证。",
    ctaFind: "60 秒找到我的尺码",
    ctaShop: "逛逛全部商品",
    heroAlt: "穿着米色 SOLFIT 运动鞋的女士",
    recEyebrow: "AI 智能推荐",
    recH2: "本周为你精选",
    topEyebrow: "高分好评",
    topH2: "最多合脚，最多好评",
    themeEyebrow: "店铺风格",
    themeTitle: "店铺主题",
    themeHint: "十套风格，一键切换 —— 你的选择会保存在本设备。",
  },
};

/** 由 cookie 取语言（非法值回落总后台站点设置的默认语言） */
export function getLangFromCookies(jar) {
  const v = jar.get("solfit_lang")?.value;
  if (LANGS.some(([code]) => code === v)) return v;
  const def = getSiteSettings().defaultLang;
  return LANGS.some(([code]) => code === def) ? def : DEFAULT_LANG;
}
