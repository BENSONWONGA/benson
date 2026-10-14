/**
 * components/NewsletterForm — 首页订阅（营销闭环 Phase 6 的一环）
 * POST /api/notifications/subscribe {email} —— 显式同意才进频控账本（GDPR）。
 */
"use client";

import { useState } from "react";

export default function NewsletterForm({ labels }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState(null); // ok | err
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setState(null);
    try {
      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (body.code !== 0) throw new Error("bad");
      setState("ok");
      setEmail("");
    } catch {
      setState("err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="news-form" onSubmit={submit} style={{ flexDirection: "column" }}>
      <div className="news-form" style={{ flexDirection: "row", flex: 1 }}>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          aria-label="Email"
        />
        <button type="submit" disabled={busy}>{busy ? "…" : labels.cta}</button>
      </div>
      {state && <p className="news-msg">{state === "ok" ? labels.ok : labels.err}</p>}
    </form>
  );
}
