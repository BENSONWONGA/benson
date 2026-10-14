/**
 * components/EmbedFinder — 嵌入式尺码组件（B2B 输出 · "24 小时接入"的最小闭环）
 * 三题问卷 → POST /api/ai/size-recommendation（无 productId —— 通用口径推荐）。
 * 跑在宿主站 iframe 内：自带样式最小化、无站点导航依赖、结果页带 Powered by 背书。
 */

"use client";

import { useState } from "react";
import { track } from "@/lib/track";

export default function EmbedFinder() {
  const [rec, setRec] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/size-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usualSize: form.get("usualSize"),
          usualBrand: form.get("usualBrand"),
          widthFeel: form.get("widthFeel"),
          footNotes: form.getAll("footNotes"),
        }),
      });
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message);
      setRec(json.data);
      track("embed_size_found", { recommended: !!json.data.size });
    } catch (err) {
      setError(err.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  const shell = {
    fontFamily: "system-ui, -apple-system, sans-serif",
    maxWidth: 420, margin: "0 auto", padding: 20,
    color: "#1d2b24", background: "#fff", borderRadius: 14,
    border: "1px solid #e5ded2",
  };

  return (
    <div style={shell}>
      {rec ? (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "#2f5d46", fontWeight: 700 }}>
            Your recommended size
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, margin: "8px 0 4px" }}>EU {rec.size}</div>
          <div style={{ fontSize: 13, color: "#6b6257", marginBottom: 10 }}>
            {rec.width} width · {rec.confidence}% fit confidence
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: "0 0 16px" }}>{rec.reason}</p>
          <button
            onClick={() => setRec(null)}
            style={{ fontSize: 13, padding: "10px 18px", borderRadius: 10, border: "1px solid #2f5d46", background: "#2f5d46", color: "#fff", cursor: "pointer" }}
          >
            Start over
          </button>
          <div style={{ marginTop: 14, fontSize: 11, color: "#9a9184" }}>
            Fit Guarantee included — free size exchanges · Powered by <b>SOLFIT Fit Engine</b>
          </div>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Find your size in 60 seconds</div>
          <div style={{ fontSize: 12, color: "#6b6257", marginBottom: 16 }}>Three questions — no email needed.</div>

          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Your usual size (EU)</label>
          <select name="usualSize" required style={{ width: "100%", padding: 10, marginBottom: 12, borderRadius: 8, border: "1px solid #e5ded2", fontSize: 14 }}>
            <option value="">Select…</option>
            {["36","36.5","37","37.5","38","38.5","39","39.5","40","40.5","41","41.5","42"].map((s) => <option key={s}>{s}</option>)}
          </select>

          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Brand you usually wear</label>
          <select name="usualBrand" required style={{ width: "100%", padding: 10, marginBottom: 12, borderRadius: 8, border: "1px solid #e5ded2", fontSize: 14 }}>
            <option value="">Select…</option>
            {["Nike", "Adidas", "New Balance", "Vionic", "Other"].map((b) => <option key={b}>{b}</option>)}
          </select>

          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Forefoot feel in that brand</label>
          {[
            ["Narrow", "Room to spare"],
            ["Standard", "Just right"],
            ["Wide", "Tight & pinches"],
          ].map(([v, label], i) => (
            <label key={v} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, padding: "6px 0", cursor: "pointer" }}>
              <input type="radio" name="widthFeel" value={v} defaultChecked={i === 1} /> {label}
            </label>
          ))}

          <div style={{ display: "flex", gap: 12, margin: "10px 0 14px", flexWrap: "wrap" }}>
            {["High arch", "Flat feet", "Bunion"].map((n) => (
              <label key={n} style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" name="footNotes" value={n} /> {n}
              </label>
            ))}
          </div>

          {error && <div style={{ color: "#C0392B", fontSize: 12, marginBottom: 10 }}>{error}</div>}

          <button
            type="submit" disabled={busy}
            style={{ width: "100%", fontSize: 15, fontWeight: 700, padding: 12, borderRadius: 10, border: "none", background: "#2f5d46", color: "#fff", cursor: "pointer" }}
          >
            {busy ? "Analyzing…" : "Find my size"}
          </button>
          <div style={{ marginTop: 12, fontSize: 11, color: "#9a9184", textAlign: "center" }}>
            Powered by <b>SOLFIT Fit Engine</b>
          </div>
        </form>
      )}
    </div>
  );
}
