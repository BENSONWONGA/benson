/**
 * ai/stylist — AI 导购对话服务（P0）
 * 架构：LLM + Function Calling + 结构化商品检索（RAG）
 * 防幻觉：商品事实只能来自 tools 的返回，system prompt 明令禁止编造
 * 多语言：LLM 天然多语言，一套架构覆盖全部站点语言
 */

import { callLLM, llmEnabled } from "@/lib/llm";
import { STYLIST_TOOLS, executeStylistTool, keywordFallback } from "@/ai/stylist/tools";
import { trackEvent } from "@/lib/db";

const SYSTEM_PROMPT = `You are "Fit Stylist", the AI shopping concierge for SOLFIT, a premium footwear DTC brand.
Rules:
1. Answer ONLY in the language of the customer's last message.
2. For ANY product question you MUST call search_products / get_product_details first. Never state prices, sizes, stock or product features from memory.
3. Keep replies under 120 words. Be warm, concrete, no fluff.
4. Recommend at most 3 pairs. If the customer mentions fit problems (wide feet, bunions, high arches), mention which last/width solves it.
5. If asked about order status, returns or payments you cannot access, say so and suggest support@solfit.example.`;

/**
 * 主入口
 * @param {string} message 用户消息
 * @param {Array} history 会话历史 [{role, content}]
 * @returns {{reply: string, products: Array, source: "llm"|"rules"}}
 */
export async function askStylist(message, history = []) {
  trackEvent("ai_stylist_message", { message });

  // 未配置 LLM => 规则兜底（骨架开箱可跑）
  if (!llmEnabled) {
    const fb = await keywordFallback(message);
    return { ...fb, source: "rules" };
  }

  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-8),
      { role: "user", content: message },
    ];

    // 第一轮：LLM 决定是否调工具
    const first = await callLLM({ messages, tools: STYLIST_TOOLS });
    const msg = first?.message;
    if (!msg) throw new Error("empty response");

    // 单轮工具调用即可覆盖导购场景（复杂多轮在 Phase 2 加 agent loop）
    if (msg.tool_calls && msg.tool_calls.length) {
      messages.push(msg);
      for (const tc of msg.tool_calls) {
        const args = JSON.parse(tc.function.arguments || "{}");
        const result = await executeStylistTool(tc.function.name, args);
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
      }
      // 第二轮：LLM 用工具返回的事实组织语言
      const second = await callLLM({ messages, temperature: 0.5 });
      const finalMsg = second?.message;
      const products = extractToolProducts(messages);
      return { reply: finalMsg?.content || msg.content || "", products, source: "llm" };
    }

    return { reply: msg.content || "", products: [], source: "llm" };
  } catch (err) {
    // LLM 失败 → 规则降级，绝不向用户暴露错误
    console.error("[stylist] LLM failed, fallback to rules:", err.message);
    const fb = await keywordFallback(message);
    return { ...fb, source: "rules-fallback" };
  }
}

/** 从 tool 消息里抽商品卡片（返回给前端渲染） */
function extractToolProducts(messages) {
  const products = [];
  for (const m of messages) {
    if (m.role === "tool") {
      try {
        const data = JSON.parse(m.content);
        if (Array.isArray(data)) products.push(...data.map((p) => p.id && { ...p }));
        else if (data && data.id) products.push(data);
      } catch (e) { /* 非 JSON 忽略 */ }
    }
  }
  return products.filter(Boolean).slice(0, 4);
}
