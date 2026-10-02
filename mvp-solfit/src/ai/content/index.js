/**
 * ai/content — AIGC 内容流水线（P1 · 方案文档 Phase 2 "AIGC 内容流水线（人审）"）
 *
 * 两条产线：
 *   1. generateProductCopy — 商品多语言详情页文案（字段级人审上线）
 *   2. generateSeoPost — SEO 博客长文草稿（长尾词 → 结构化文章 → 商家编辑后发布）
 *
 * 铁律：必须人审。生成结果只进商家编辑表单，绝不直接 publish ——
 * 内容质量与退货率直接挂钩（行业约 22% 退货源于"实物与描述不符"），
 * 且 SEO 内容代表站点 E-E-A-T，AI 直接发布会放大幻觉风险。
 *
 * 模型层：lib/llm 适配层（OpenAI 兼容端点可插拔）；未配 LLM_API_KEY 时
 * 走规则模板兜底（基于楦型库/商品事实拼装）—— 开箱可跑，source 标记来源。
 */

import { callLLM, llmEnabled } from "@/lib/llm";
import { getProduct, searchProducts } from "@/modules/catalog/service";
import { trackEvent } from "@/lib/db";

const TONE_GUIDE = `SOLFIT voice: warm, precise, quietly confident. Short sentences. Concrete materials and fit facts.
Never use: "revolutionary", "game-changing", "unlock", exclamation marks, or generic AI phrases.`;

/**
 * 生成商品多语言文案
 * @returns {{title, bullets[], meta}} — 输出结构化字段而非整篇 HTML，便于人审与字段级上线
 */
export async function generateProductCopy(productId, locale = "en-US") {
  const product = await getProduct(productId);
  if (!product) throw new Error("PRODUCT_NOT_FOUND");

  if (!llmEnabled) {
    // 规则兜底：直接用结构化种子数据拼装（保证骨架可跑）
    return {
      title: product.name,
      bullets: product.features,
      meta: `${product.category} · ${product.heel} heel · ${product.widths.join("/")} width`,
      source: "template",
    };
  }

  const messages = [
    { role: "system", content: `${TONE_GUIDE}\nOutput JSON: {title, bullets[3], meta}. Language: ${locale}.` },
    {
      role: "user",
      content: `Write catalog copy from these VERIFIED product facts only: ${JSON.stringify({
        name: product.name, category: product.category, heel: product.heel,
        features: product.features, desc: product.desc,
      })}`,
    },
  ];
  const res = await callLLM({ messages, temperature: 0.7, maxTokens: 400 });
  try {
    const out = { ...JSON.parse(res.message.content), source: "llm" };
    trackEvent("content_generated", { mode: "product_copy", source: "llm" });
    return out;
  } catch (e) {
    return { title: product.name, bullets: product.features, meta: "", source: "llm-unparsed" };
  }
}

// ===== SEO 文章产线（Phase 2 · AIGC 流水线）=====

/** 标题化：句子 → Title Case（模板兜底产线的 slug/标题口径；首词必大写） */
const titleCase = (s) =>
  String(s).trim().replace(/\s+/g, " ").split(" ")
    .map((w, i) => (i === 0 || w.length > 3 ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");

const deriveTags = (topic) => {
  const stop = new Set(["how", "to", "the", "a", "an", "for", "of", "and", "in", "on", "with", "your", "my", "best", "guide", "shoes", "shoe"]);
  return [...new Set(topic.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 2 && !stop.has(w)))].slice(0, 4);
};

/** 模板兜底：topic + 商品事实 → 四段结构化文章（长尾词进标题/首段/结尾 —— SEO 基本功） */
function templateSeoPost(topic, products) {
  const title = titleCase(topic);
  const tags = deriveTags(topic);
  const pick = products.slice(0, 2);
  const pickLine = pick.length
    ? `For this, we reach for ${pick.map((p) => `the ${p.name} (${p.category.toLowerCase()}, ${p.widths.join("/")} width)`).join(" and ")}.`
    : "Filter the shop by width and heel height to shortlist pairs built for this.";

  const body = [
    `${title} — the question our fit team hears every week. Here is what actually works, based on how shoes are built.`,
    `The short answer: consistency beats intensity. Whatever approach you take, do it the same way each time — feet change shape through the day, so measure and treat them under the same conditions. Standing, end of day, weight on the foot.`,
    pickLine,
    `Every pair ships with the Fit Guarantee: if the size is wrong, the exchange is free. That is the whole point of measuring before you buy.`,
  ].join("\n\n");

  return {
    title: title.length > 70 ? title.slice(0, 67) + "…" : title,
    excerpt: `A fit-team answer to "${topic.toLowerCase()}" — what works, what to ignore, and which pairs make it easy.`,
    body,
    tags,
    source: "template",
  };
}

/**
 * 生成 SEO 博客文章草稿（人审输入端）。
 * @param {object} p
 * @param {string} p.topic 长尾主题（如 "how to clean suede shoes"）
 * @param {number} [p.productId] 聚焦某商品（内链与商品推荐上下文）
 * @returns {{title, excerpt, body, tags[], source}} — 与 content 域 createPost 入参对齐
 */
export async function generateSeoPost({ topic, productId } = {}) {
  const t = String(topic || "").trim();
  if (!t || t.length < 4) throw new Error("TOPIC_REQUIRED");

  // 检索相关在售商品（内链素材 + LLM 事实约束 —— 防幻觉只准写真实商品）
  let products = [];
  const focused = productId ? await getProduct(productId) : null;
  if (focused) products = [focused, ...searchProducts({ keyword: focused.category, max: 1 })];
  else products = searchProducts({ keyword: t.split(/\s+/)[0], max: 3 });

  if (!llmEnabled) {
    const draft = templateSeoPost(t, products);
    trackEvent("content_generated", { mode: "seo_post", source: "template" });
    return draft;
  }

  const messages = [
    {
      role: "system",
      content: `${TONE_GUIDE}
You write SEO fit guides for a footwear store. Target one long-tail search intent per article.
Structure: hook intro → practical advice in short paragraphs → one product-recommendation paragraph → Fit Guarantee close.
ONLY reference products from the verified facts given. Output JSON: {"title": string(<=70 chars), "excerpt": string(<=200 chars), "body": string(paragraphs separated by blank lines), "tags": string[](<=4)}`,
    },
    {
      role: "user",
      content: `Topic: "${t}".
Verified product facts you may reference: ${JSON.stringify(
        products.map((p) => ({ name: p.name, category: p.category, heel: p.heel, widths: p.widths, features: p.features })),
      )}`,
    },
  ];

  const res = await callLLM({ messages, temperature: 0.6, maxTokens: 900 });
  try {
    const out = JSON.parse(res.message.content);
    const draft = {
      title: String(out.title || "").slice(0, 120),
      excerpt: String(out.excerpt || "").slice(0, 200),
      body: String(out.body || "").replace(/\n{3,}/g, "\n\n").trim(),
      tags: Array.isArray(out.tags) ? out.tags.slice(0, 4).map(String) : deriveTags(t),
      source: "llm",
    };
    trackEvent("content_generated", { mode: "seo_post", source: "llm" });
    return draft;
  } catch (e) {
    // 模型输出不可解析 → 降级模板（流水线不因模型抖动中断）
    const draft = templateSeoPost(t, products);
    trackEvent("content_generated", { mode: "seo_post", source: "template-fallback" });
    return draft;
  }
}
