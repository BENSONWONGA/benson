/**
 * components/ReviewForm — 评价表单（Phase 18 客户端小岛）
 * 已购才可评（服务端验证，前端只做状态提示）；fit 反馈联动商品 fitStats。
 * 提交成功 router.refresh() —— SSR 评价列表与聚合摘要即刻更新。
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const FIT_OPTIONS = [
  ["too_small", "Runs small"],
  ["true_to_size", "True to size"],
  ["too_large", "Runs large"],
];

export default function ReviewForm({ productId, status }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [fit, setFit] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!status.purchased) {
    return <p className="muted" style={{ fontSize: 13 }}>Only customers who bought this pair can write a review.</p>;
  }
  if (status.reviewed) {
    return <p style={{ fontSize: 13, color: "var(--fit)" }}>✓ You reviewed this pair — thanks for helping others find their fit.</p>;
  }

  async function submit(e) {
    e.preventDefault();
    if (!rating) { setError("Pick a star rating first."); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, rating, title, body, fit: fit || undefined }),
      });
      const json = await res.json();
      if (!res.ok || json.code !== 0) {
        setError(json.message === "NOT_PURCHASED" ? "We couldn't find your order for this pair." : json.message);
        return;
      }
      setBody(""); setTitle(""); setRating(0); setFit("");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="finder-form" onSubmit={submit} style={{ maxWidth: 520 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 22, lineHeight: 1, color: n <= rating ? "#D4880F" : "var(--border)",
              padding: 0,
            }}
          >
            ★
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="rv-fit">How does it fit? (optional)</label>
        <select id="rv-fit" value={fit} onChange={(e) => setFit(e.target.value)}>
          <option value="">Pick one…</option>
          {FIT_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="rv-title">Title (optional)</label>
        <input id="rv-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Finally a pair that fits!" />
      </div>
      <div>
        <label htmlFor="rv-body">Your review *</label>
        <textarea id="rv-body" value={body} onChange={(e) => setBody(e.target.value)} required placeholder="Width, comfort, sizing advice for other shoppers…" style={{ minHeight: 90, resize: "vertical" }} />
      </div>
      {error && <p style={{ color: "#C0392B", fontSize: 13, margin: 0 }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit review"}</button>
    </form>
  );
}
