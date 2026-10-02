/**
 * ai/content — 商品内容生成服务（P1）
 * 多语言详情页文案 / SEO 博客 —— 必须人审 + 品牌语调约束（Tone Guide 注入 prompt）
 * 内容质量与退货率直接挂钩（行业约 22% 退货源于"实物与描述不符"）
 */

import { callLLM, llmEnabled } from "@/lib/llm";
import { getProduct } from "@/modules/catalog/service";

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
    return { ...JSON.parse(res.message.content), source: "llm" };
  } catch (e) {
    return { title: product.name, bullets: product.features, meta: "", source: "llm-unparsed" };
  }
}
