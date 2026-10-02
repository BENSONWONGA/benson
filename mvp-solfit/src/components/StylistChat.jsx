/**
 * components/StylistChat — AI 导购浮窗（客户端）
 * POST /api/ai/stylist {message, history} — 未配置 LLM 时服务端自动走规则兜底
 * 商品卡片严格来自结构化检索返回（防幻觉契约）
 */

"use client";

import { useEffect, useRef, useState } from "react";

export default function StylistChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // {role, content, products?}
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);
  const historyRef = useRef([]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, busy]);

  async function send(text) {
    const msg = text ?? input.trim();
    if (!msg || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ai/stylist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history: historyRef.current }),
      });
      const json = await res.json();
      const bot = { role: "bot", content: json.data.reply, products: json.data.products || [] };
      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: msg },
        { role: "assistant", content: json.data.reply },
      ].slice(-8);
      setMessages((m) => [...m, bot]);
    } catch {
      setMessages((m) => [...m, { role: "bot", content: "Connection hiccup — try again in a moment." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="chat-fab" aria-label="Open Fit Stylist" onClick={() => setOpen(!open)}>
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
        )}
      </button>

      {open ? (
        <div className="chat-panel">
          <div className="chat-head">Fit Stylist — AI concierge</div>
          <div className="chat-log" ref={logRef}>
            {messages.length === 0 ? (
              <div className="msg bot">
                Hi! Tell me an occasion, a vibe, or a fit problem — I&apos;ll pull the right pairs.{" "}
                <i className="muted">(LLM 未配置时自动走规则引擎)</i>
              </div>
            ) : null}
            {messages.map((m, i) => (
              <div key={i}>
                <div className={"msg " + (m.role === "user" ? "user" : "bot")}>{m.content}</div>
                {m.products?.length
                  ? m.products.map((p) => (
                      <div key={p.id} className="chat-rec">
                        {p.name} — ${p.price}{" "}
                        <a href={"/product/" + p.id}>View →</a>
                      </div>
                    ))
                  : null}
              </div>
            ))}
            {busy ? <div className="msg bot">…</div> : null}
          </div>
          <div className="chat-input">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask about a pair, a size, an occasion…"
            />
            <button onClick={() => send()} aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
