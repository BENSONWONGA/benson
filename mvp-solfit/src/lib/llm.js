/**
 * lib/llm.js — LLM Provider 适配层（AI 服务层唯一出口）
 *
 * 设计要点：
 * 1. 任何 OpenAI 兼容端点可插拔（OpenAI / GLM / DeepSeek / Qwen / vLLM）
 * 2. 未配置 LLM_API_KEY 时返回 null，调用方走规则/mock 兜底 => 项目开箱可跑
 * 3. 统一超时与错误处理，业务层不感知 Provider 差异
 *
 * TODO(Phase 2): 加流式(SSE)、token 计量、多模型分级（简单意图走小模型降本）
 */

const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

export const llmEnabled = Boolean(LLM_API_KEY);

/**
 * 调用 LLM Chat Completions（含 Function Calling）
 * @param {{messages: Array, tools?: Array, temperature?: number, maxTokens?: number}} opts
 * @returns {Promise<{message: {role, content, tool_calls}}|null>} 未配置时返回 null
 */
export async function callLLM({ messages, tools, temperature = 0.4, maxTokens = 800 }) {
  if (!llmEnabled) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000); // 20s 硬超时
  try {
    const res = await fetch(LLM_BASE_URL.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        ...(tools && tools.length ? { tools, tool_choice: "auto" } : {}),
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return { message: json.choices?.[0]?.message ?? null };
  } catch (err) {
    // 模型不可用时向上抛，由 AI 服务统一降级到规则层
    throw new Error("LLM call failed: " + err.message);
  } finally {
    clearTimeout(timer);
  }
}
