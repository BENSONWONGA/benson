/**
 * components/OrderExchange — Fit Guarantee 换货/退货表单（订单确认页）
 * 数据回流：每次换码 = 尺码引擎 V3 的一条标注训练样本（方案文档 §5.1）
 */

"use client";

import { useState } from "react";

const REASONS = [
  ["too_small", "Too small"],
  ["too_large", "Too large"],
  ["quality", "Quality issue"],
  ["not_as_described", "Not as described"],
  ["changed_mind", "Changed my mind"],
];

export default function OrderExchange({ order }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ productId: order.items[0]?.productId, fromSize: String(order.items[0]?.size), toSize: "", reason: "too_small" });
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch("/api/orders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: order.id,
        productId: Number(form.productId),
        fromSize: form.fromSize,
        toSize: form.toSize || null,
        reason: form.reason,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.code === 0) setDone(true);
    else setError(json.message);
  }

  if (done) {
    return (
      <div className="fit-strip">
        <b>Exchange requested.</b> A prepaid label is on its way to your email (stub). Your fit data feeds the
        size engine — the next recommendation gets smarter because of this.
      </div>
    );
  }

  return (
    <section style={{ marginTop: 32 }}>
      <button className="btn btn-outline" onClick={() => setOpen(!open)}>Fit Guarantee — request exchange</button>

      {open ? (
        <form className="co-pane" onSubmit={submit} style={{ maxWidth: 460 }}>
          <h3>Exchange or return</h3>
          <div className="co-grid">
            <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} aria-label="Item">
              {order.items.map((i, idx) => <option key={idx} value={i.productId}>{i.name} · EU {i.size}</option>)}
            </select>
            <select value={form.toSize} onChange={(e) => setForm({ ...form, toSize: e.target.value })} aria-label="New size">
              <option value="">Return only (refund)</option>
              {["36", "37", "38", "39", "40", "41", "42"].filter((s) => s !== form.fromSize).map((s) => <option key={s} value={s}>Exchange to EU {s}</option>)}
            </select>
            <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} aria-label="Reason">
              {REASONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>
          {error ? <p style={{ color: "#B23A2E", fontWeight: 600 }}>{error}</p> : null}
          <button className="btn btn-fit" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button>
          <p className="muted">Free exchanges within 60 days. Prepaid local drop-off label (stub).</p>
        </form>
      ) : null}
    </section>
  );
}
