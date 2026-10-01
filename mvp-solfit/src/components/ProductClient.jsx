/**
 * components/ProductClient — PDP 交互岛（客户端）
 * 1) 宽窄/尺码选择 + 加购 → POST /api/cart
 * 2) AI Size Finder 三步向导 → POST /api/ai/size-recommendation（含楦型校验）
 * 档案沉淀在服务端（modules/customer），刷新后仍预选
 */

"use client";

import { useEffect, useState } from "react";

export default function ProductClient({ product }) {
  const [width, setWidth] = useState(product.widths[0]);
  const [size, setSize] = useState(null);
  const [qty, setQty] = useState(1);
  const [toast, setToast] = useState(null);
  const [finderOpen, setFinderOpen] = useState(false);
  const [finderStep, setFinderStep] = useState("form"); // form | scanning | result
  const [rec, setRec] = useState(null);

  const notify = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  // 已保存的脚型档案 → 进站预选（GET 回读，含楦型校验结果）
  useEffect(() => {
    fetch("/api/ai/size-recommendation")
      .then((r) => r.json())
      .then((json) => {
        const saved = json.data;
        // 只回显"本商品"的档案结果（档案在 POST 时以 productId 维度落楦型校验）
        if (saved?.recommendation && Number(saved.productId) === Number(product.id)) {
          setRec(saved.recommendation);
        }
      })
      .catch(() => {});
  }, [product.id]);

  async function addToCart() {
    if (!size) { notify("Pick a size first — or let the AI choose"); return; }
    const res = await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", productId: product.id, size, width, qty }),
    });
    const json = await res.json();
    if (json.code === 0) {
      window.dispatchEvent(new Event("solfit:cart"));
      notify(`Added — EU ${size} · ${width}`);
    } else {
      notify(json.message || "Failed to add");
    }
  }

  async function submitFinder(e) {
    e.preventDefault();
    const form = new FormData(e.target);
    setFinderStep("scanning");
    const res = await fetch("/api/ai/size-recommendation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usualSize: form.get("usualSize"),
        usualBrand: form.get("usualBrand"),
        widthFeel: form.get("widthFeel"),
        footNotes: form.getAll("footNotes"),
        productId: product.id, // 落楦型校验：finalSize / exactMatch
      }),
    });
    const json = await res.json();
    setRec(json.data);
    setFinderStep("result");
  }

  return (
    <div>
      <div>
        <div className="option-label">Width</div>
        {product.widths.map((w) => (
          <label key={w} style={{ marginRight: 10, fontSize: 13, cursor: "pointer" }}>
            <input type="radio" name="width" checked={width === w} onChange={() => setWidth(w)} /> {w}
          </label>
        ))}
      </div>

      <div className="option-label" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Size (EU)</span>
        <button className="btn btn-fit btn-sm" onClick={() => { setFinderOpen(true); setFinderStep("form"); }}>
          Find my size with AI
        </button>
      </div>
      <div className="size-grid">
        {product.sizes.map((s) => {
          const oos = product.oos.includes(s);
          const isAi = rec && rec.finalSize === s;
          return (
            <button
              key={s}
              type="button"
              disabled={oos}
              className={"size-cell" + (size === s ? " active" : "") + (oos ? " oos" : "") + (isAi ? " ai-pick" : "")}
              onClick={() => setSize(s)}
            >
              EU {s}
            </button>
          );
        })}
      </div>
      {rec && !rec.exactMatch ? (
        <p className="muted" style={{ marginTop: 10 }}>
          Your profile suggests EU {rec.size}; this last runs full sizes only — EU {rec.finalSize} is closest.
        </p>
      ) : null}

      <div className="pdp-buy">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setQty(Math.max(1, qty - 1))}>–</button>
          <span style={{ fontWeight: 700 }}>{qty}</span>
          <button className="btn btn-outline btn-sm" onClick={() => setQty(qty + 1)}>+</button>
        </div>
        <button className="btn btn-primary" onClick={addToCart}>Add to cart — Fit Guarantee included</button>
      </div>

      {finderOpen ? (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setFinderOpen(false)}>
          <div className="modal">
            <button className="close" onClick={() => setFinderOpen(false)}>✕</button>
            <h3>AI Size Finder</h3>

            {finderStep === "form" ? (
              <form className="finder-form" onSubmit={submitFinder}>
                <div>
                  <label htmlFor="usualSize">Your usual size (EU)</label>
                  <select id="usualSize" name="usualSize" required>
                    <option value="">Select…</option>
                    {["36","36.5","37","37.5","38","38.5","39","39.5","40","40.5","41","41.5","42"].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="usualBrand">Brand you usually wear</label>
                  <select id="usualBrand" name="usualBrand" required>
                    <option value="">Select…</option>
                    {["Nike", "Adidas", "New Balance", "Vionic", "Other"].map((b) => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label>Forefoot feel in that brand</label>
                  <label><input type="radio" name="widthFeel" value="Narrow" /> Room to spare</label>{" "}
                  <label><input type="radio" name="widthFeel" value="Standard" defaultChecked /> Just right</label>{" "}
                  <label><input type="radio" name="widthFeel" value="Wide" /> Tight &amp; pinches</label>
                </div>
                <div>
                  <label>Fit notes (optional)</label>
                  {["High arch", "Flat feet", "Bunion"].map((n) => (
                    <label key={n} style={{ marginRight: 10 }}><input type="checkbox" name="footNotes" value={n} /> {n}</label>
                  ))}
                </div>
                <button className="btn btn-fit" type="submit">Scan &amp; find my size</button>
                <p className="muted">V2 接入点：此步换手机摄像头量脚（CV 测脚长/宽/脚背）</p>
              </form>
            ) : null}

            {finderStep === "scanning" ? <p style={{ padding: 40, textAlign: "center" }}>Analyzing 13 measurement points…</p> : null}

            {finderStep === "result" && rec ? (
              <div className="finder-result">
                <div className="eyebrow">Your SOLFIT size</div>
                <div className="size">EU {rec.finalSize}</div>
                <div className="conf">{rec.confidence}% fit confidence · {rec.width} width</div>
                <p>{rec.reason}</p>
                <p className="muted">Last {product.lastCode} adjustment: {rec.productAdjustment?.note}</p>
                <button
                  className="btn btn-fit"
                  onClick={() => { setSize(rec.finalSize); setFinderOpen(false); notify("Recommended size applied"); }}
                >
                  Apply this size
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
