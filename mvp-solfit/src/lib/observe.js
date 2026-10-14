/**
 * lib/observe.js — HTTP RED 观测（Rate / Errors / Duration）
 *
 * 用法（路由内 3 行接入，不改变导出签名与行为）：
 *   export async function POST(request) {
 *     return observed("events", async () => { ...原逻辑... });
 *   }
 *
 * Next 14 middleware 跑在 Edge runtime，摸不到进程内指标注册表 —— 所以用
 * 显式包装而非 middleware（内存指标的正确做法；换 OTel 后此层原位换 SDK span）。
 */

import { counter, histogram } from "@/lib/metrics";

const httpTotal = counter("solfit_http_requests_total"); // label: { route, code }
const httpDuration = histogram("solfit_http_request_duration_seconds"); // label: { route }

function record(route, code, ms) {
  httpTotal.inc(1, { route, code: String(code) });
  httpDuration.observe(Math.round(ms) / 1000, { route });
}

/**
 * 包装一次 API 路由执行：计时 + 状态码计数（含 5xx 抛出路径）
 * @param {string} route 路由短名（label 用，勿带动态参数 —— 基数安全）
 * @param {() => Promise<Response>} fn
 */
export async function observed(route, fn) {
  const start = performance.now();
  try {
    const res = await fn();
    record(route, res?.status ?? 200, performance.now() - start);
    return res;
  } catch (err) {
    record(route, 500, performance.now() - start);
    throw err; // 错误语义交还框架（Next 会转 500），观测层只计数
  }
}
