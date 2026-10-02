/**
 * lib/i18n — 多语言（骨架期：首页全量文案；Phase 2 铺开全站 + locale 路由 + hreflang）
 *
 * 机制：cookie `solfit_lang` 驱动 SSR（与货币同款偏好持久化）。
 * 不引 i18n 框架 —— 文案集中一处、零依赖（自研边界铁律）。
 * 默认语言回落总后台站点设置（lib/site-settings —— 保持本文件客户端可打包）。
 *
 * 品牌口径（Phase 23 潮流运动方向）：短句、大写、命令式 —— 不写散文。
 */

import { getSiteSettings } from "@/lib/site-settings";

export const DEFAULT_LANG = "en";
export const LANGS = [
  ["en", "English"],
  ["zh", "中文"],
];

/**
 * 首页文案字典（商品名/类目等业务数据不翻 —— 数据层多语言是 Phase 2 PG 建模范畴）
 * 7 个"商家后台可装修"字段（hero 五项 + recH2 + topH2）与 lib/site-settings HOME_FIELDS 对齐。
 */
export const HOME_TEXT = {
  en: {
    // ===== Hero（后台可装修）=====
    heroEyebrow: "AI-FIT PERFORMANCE FOOTWEAR",
    heroH1: "STOP GUESSING YOUR SIZE.",
    heroLede: "63% of people walk in the wrong shoe. Our AI reads your feet in 60 seconds and locks in your exact last — free exchange on every pair.",
    ctaFind: "Scan my feet — 60 sec",
    ctaShop: "Shop the drop",
    // ===== 区块标题（recH2/topH2 后台可装修）=====
    recEyebrow: "AI Matchday picks",
    recH2: "Matched for you",
    topEyebrow: "Bestsellers",
    topH2: "The drop",
    // ===== USP 条 =====
    usps: [
      ["60-SEC AI FIT SCAN", "Your last, your size — not a chart"],
      ["FREE SIZE EXCHANGES", "60 days, every order, no questions"],
      ["EXPRESS US / EU SHIPPING", "Free over $120, duties quoted upfront"],
      ["10 LASTS ENGINEERED", "Wide to narrow — built, not stretched"],
    ],
    // ===== 跑马灯 =====
    marquee: "AI FIT SCAN · FREE EXCHANGES · 60-DAY GUARANTEE · EXPRESS US/EU · ENGINEERED LASTS · ",
    // ===== 品牌故事 =====
    storyEyebrow: "Why SOLFIT exists",
    storyH2: "Wrong size is a performance tax.",
    storyBody: "Blisters, black toenails, 2pm surrenders — bad fit quietly taxes every step. We built a fit engine instead of a size chart: AI reads your feet, matches them to a purpose-built last, and backs it with a guarantee you never have to use.",
    storyStats: [
      ["63%", "of people wear the wrong size"],
      ["60s", "from photo to your exact fit"],
      ["-38%", "fit-related returns vs industry"],
    ],
    storyCta: "How the fit engine works",
    // ===== Fit Science 三步 =====
    scienceEyebrow: "Fit science",
    scienceH2: "Three steps. Zero guesswork.",
    steps: [
      ["01", "SCAN", "Two photos of your feet — or the 30-second questionnaire if you hate cameras."],
      ["02", "MATCH", "The engine reads length, width and arch, then maps them onto one of our 10 engineered lasts."],
      ["03", "LOCKED IN", "Your EU size ships. If reality disagrees, a free exchange fixes it — 60 days, both ways."],
    ],
    // ===== FAQ =====
    faqH2: "Straight answers",
    faqs: [
      ["How accurate is the 60-second scan?", "On our test set, 9 in 10 scans land on a size the customer keeps. It reads length, width and arch shape — more than any chart can. And if it's ever wrong, the exchange is free."],
      ["What if the fit isn't right?", "Free size exchange within 60 days on every pair, every order. One click from your order page, we ship the new size before the old one arrives."],
      ["Do you ship worldwide?", "Express from US and EU warehouses. Duties and taxes are quoted at checkout — no surprise bills at your door."],
      ["What makes a 'last' special?", "A last is the foot-shaped mold a shoe is built on. Ours are engineered in 10 widths and shapes, so 'wide' means designed wide from day one — not a standard pattern stretched."],
    ],
    // ===== 订阅 =====
    newsH2: "Get the next drop first.",
    newsSub: "New releases, restocks and fit science — straight to your inbox. No noise.",
    newsCta: "Notify me",
    newsOk: "You're on the list. Watch your inbox.",
    newsErr: "Something went wrong — try again.",
    footerTag: "Engineered fit for people who move.",
  },
  zh: {
    // ===== Hero（后台可装修）=====
    heroEyebrow: "AI 量脚 · 运动型鞋履",
    heroH1: "别再猜尺码了。",
    heroLede: "63% 的人穿着错误的鞋码。AI 在 60 秒内读取你的脚型，锁定专属楦型 —— 每一双都附带免费换码保证。",
    ctaFind: "60 秒量我的脚",
    ctaShop: "看本周主打",
    // ===== 区块标题（recH2/topH2 后台可装修）=====
    recEyebrow: "AI 智能推荐",
    recH2: "为你匹配",
    topEyebrow: "热销榜",
    topH2: "本周主打",
    // ===== USP 条 =====
    usps: [
      ["60 秒 AI 量脚", "你的楦型你的码，不查对照表"],
      ["免费换码", "60 天内，每一单，不问理由"],
      ["美/欧仓急速发货", "$120 免邮，关税下单前报清"],
      ["10 套工程楦型", "宽脚窄脚，原生设计而非拉伸"],
    ],
    // ===== 跑马灯 =====
    marquee: "AI 量脚 · 免费换码 · 60 天保证 · 美欧仓急速 · 工程楦型 · ",
    // ===== 品牌故事 =====
    storyEyebrow: "为什么做 SOLFIT",
    storyH2: "错码，是在为每一步交税。",
    storyBody: "磨脚、黑指甲、下午两点就想脱鞋 —— 不合脚在悄悄惩罚你的每一步。我们不印尺码表，我们造合脚引擎：AI 读取脚型，匹配工程楦型，再附上一份你几乎用不上的换码保证。",
    storyStats: [
      ["63%", "的人穿错鞋码"],
      ["60 秒", "从拍照到专属尺码"],
      ["-38%", "合脚相关退货低于行业"],
    ],
    storyCta: "看合脚引擎怎么运作",
    // ===== Fit Science 三步 =====
    scienceEyebrow: "合脚科学",
    scienceH2: "三步，零猜测。",
    steps: [
      ["01", "扫描", "拍两张脚部照片 —— 不想拍的话，30 秒问卷同样搞定。"],
      ["02", "匹配", "引擎读取脚长、脚宽与足弓，映射到 10 套工程楦型之一。"],
      ["03", "锁定", "你的 EU 码发出。万一不合脚，免费换码 —— 60 天双向保障。"],
    ],
    // ===== FAQ =====
    faqH2: "直接给答案",
    faqs: [
      ["60 秒扫描准不准？", "测试集里 9 成扫描给出的尺码顾客最终留了下来。它读脚长、脚宽和足弓形态 —— 比任何尺码表都多。万一不准，换码免费。"],
      ["不合脚怎么办？", "每一单都享 60 天免费换码。订单页一键发起，新码先发、旧码后回。"],
      ["发货到全球吗？", "美欧仓急速发货，关税税费在下单前就报清 —— 门口不会出现第二张账单。"],
      ["“楦型”是什么？", "楦是鞋子的脚型模具。我们的 10 套楦型按宽窄/脚型原生设计 —— 所谓“宽脚款”是天生宽，不是把标准鞋撑大。"],
    ],
    // ===== 订阅 =====
    newsH2: "下一波上新，你第一个知道。",
    newsSub: "新品、补货、合脚科学 —— 直达邮箱，不发垃圾。",
    newsCta: "通知我",
    newsOk: "已登记，留意邮箱。",
    newsErr: "出了点问题 —— 再试一次。",
    footerTag: "为一直在动的人，做合脚的鞋。",
  },
};

/** 由 cookie 取语言（非法值回落总后台站点设置的默认语言） */
export function getLangFromCookies(jar) {
  const v = jar.get("solfit_lang")?.value;
  if (LANGS.some(([code]) => code === v)) return v;
  const def = getSiteSettings().defaultLang;
  return LANGS.some(([code]) => code === def) ? def : DEFAULT_LANG;
}
