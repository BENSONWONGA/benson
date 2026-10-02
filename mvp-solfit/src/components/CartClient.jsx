/**
 * components/CartClient — 购物车页交互岛
 * 数据：GET/POST /api/cart（服务端计价，USD 恒定）· 展示：按当前货币换算
 */

"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";

export default function CartClient({ currency = "USD" }) {
  const [cart, setCart] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await fetch("/api/cart");
    const json = await res.json();
    setCart(json.data);
  }

  async function mutate(action, payload) {
    setBusy(true);
    const res = await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const json = await res.json();
    if (json.code === 0) {
      setCart(json.data);
      window.dispatchEvent(new Event("solfit:cart"));
    }
    setBusy(false);
  }

  if (!cart) return <p className="muted">Loading cart…</p>;

  if (!cart.items.length) {
    return (
      <div style={{ textAlign: "center", padding: 64 }}>
        <p style={{ marginBottom: 16 }}>Your cart is empty.</p>
        <a className="btn btn-primary" href="/shop">Shop the collection</a>
      </div>
    );
  }

  const freeLeft = Math.max(0, 120 - cart.totals.subtotal);

  return (
    <div className="cart-layout">
      <div>
        {cart.items.map((item, idx) => (
          <div className="cart-row" key={item.productId + item.size + item.width}>
            <img src={item.product.image} alt={item.product.name} />
            <div className="cart-row-info">
              <a href={`/product/${item.productId}`} style={{ fontWeight: 700 }}>{item.product.name}</a>
              <p className="muted">EU {item.size} · {item.width} width</p>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => mutate("update", { index: idx, qty: item.qty - 1 })} aria-label="Decrease">–</button>
                <span style={{ fontWeight: 700, alignSelf: "center" }}>{item.qty}</span>
                <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => mutate("update", { index: idx, qty: item.qty + 1 })} aria-label="Increase">+</button>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="price">{formatMoney(item.product.price * item.qty, currency)}</div>
              <button className="remove-link" disabled={busy} onClick={() => mutate("remove", { index: idx })}>Remove</button>
            </div>
          </div>
        ))}
      </div>

      <aside className="cart-summary">
        <h3>Summary</h3>
        <div className="sum-row"><span>Subtotal</span><b>{formatMoney(cart.totals.subtotal, currency)}</b></div>
        <div className="sum-row"><span>Shipping (est.)</span><b>{cart.totals.shipping ? formatMoney(cart.totals.shipping, currency) : "Free"}</b></div>
        <p className="muted">{freeLeft > 0 ? `Add ${formatMoney(freeLeft, currency)} more for free express shipping` : "Free express shipping unlocked"}</p>
        <p className="muted">Duties &amp; VAT calculated at checkout by destination country.</p>
        <a className="btn btn-primary" href="/checkout" style={{ width: "100%", marginTop: 12 }}>Checkout</a>
      </aside>
    </div>
  );
}
