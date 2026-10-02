/**
 * components/CheckoutClient — 结算流程（方案文档 §7.1/§7.2/§7.4）
 * 三步：地址(选国即报价) → 配送方法 → 支付(演示桩) → 下单
 * 金额全部由服务端 /api/checkout 计算返回，前端不参与计价 —— 防篡改。
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/currency";
import { track } from "@/lib/track";

const COUNTRIES = [
  ["US", "United States"], ["GB", "United Kingdom"], ["DE", "Germany"], ["FR", "France"],
  ["NL", "Netherlands"], ["ES", "Spain"], ["IT", "Italy"], ["CA", "Canada"], ["AU", "Australia"], ["JP", "Japan"],
];

export default function CheckoutClient({ currency = "USD" }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [address, setAddress] = useState({ name: "", email: "", street: "", city: "", zip: "", country: "US" });
  const [quote, setQuote] = useState(null);       // {methods, method, tax, totals}
  const [methodId, setMethodId] = useState(null);
  const [payment, setPayment] = useState({ card: "", exp: "", cvc: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // 结算漏斗起点（consent 闸门内）
  useEffect(() => { track("checkout_started", { currency }); }, []);

  // 挂载时即获取默认国家报价（避免用户不切换国家时 step 2 空白）
  useEffect(() => {
    updateAddress({ country: address.country });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateAddress(patch) {
    const next = { ...address, ...patch };
    setAddress(next);
    if (patch.country !== undefined) {
      // 选国即报价 —— 税费透明是跨境转化关键（方案 §7.1）
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "quote", address: { country: next.country } }),
      });
      const json = await res.json();
      if (json.code === 0) {
        setQuote(json.data);
        setMethodId(json.data.method.id);
      }
    }
  }

  const chosen = quote?.methods?.find((m) => m.id === methodId);
  const totals = chosen
    ? {
        subtotal: quote.totals.subtotal,
        shipping: chosen.finalPrice,
        tax: Math.round((chosen.finalPrice + quote.totals.subtotal) * (quote.tax.rate || 0) * 100) / 100,
      }
    : null;
  if (totals) totals.total = Math.round((totals.subtotal + totals.shipping + totals.tax) * 100) / 100;

  async function placeOrder() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "place", email: address.email, address, methodId }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        setError(json.message === "OUT_OF_STOCK" ? "An item just sold out — back to cart to adjust sizes." : json.message);
        setBusy(false);
        return;
      }

      const order = json.data;
      // Stripe 真实链路：有 clientSecret 时用 Stripe.js 确认支付
      if (order.payment?.clientSecret) {
        const stripe = await loadStripe();
        const { error: confirmErr } = await stripe.confirmCardPayment(order.payment.clientSecret, {
          payment_method: { card: { number: payment.card, exp_month: payment.exp.split("/")[0], exp_year: "20" + payment.exp.split("/")[1], cvc: payment.cvc } },
        });
        if (confirmErr) {
          setError(confirmErr.message);
          setBusy(false);
          return;
        }
      }
      // demo 模式或支付确认成功 → 跳转订单页
      window.dispatchEvent(new Event("solfit:cart"));
      router.push(`/order/${order.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  // 懒加载 Stripe.js（仅真实链路需要）
  let _stripePromise = null;
  function loadStripe() {
    if (!_stripePromise) {
      _stripePromise = new Promise((resolve, reject) => {
        if (window.Stripe) return resolve(window.Stripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY));
        const s = document.createElement("script");
        s.src = "https://js.stripe.com/v3/";
        s.onload = () => resolve(window.Stripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY));
        s.onerror = reject;
        document.body.appendChild(s);
      });
    }
    return _stripePromise;
  }

  return (
    <div className="checkout-layout">
      <div>
        <ol className="co-steps">
          <li className={step >= 1 ? "on" : ""}>1 · Address</li>
          <li className={step >= 2 ? "on" : ""}>2 · Shipping</li>
          <li className={step >= 3 ? "on" : ""}>3 · Payment</li>
        </ol>

        {step === 1 ? (
          <section className="co-pane">
            <h3>Delivery address</h3>
            <div className="co-grid">
              <input placeholder="Full name" value={address.name} onChange={(e) => updateAddress({ name: e.target.value })} />
              <input placeholder="Email for order updates" type="email" value={address.email} onChange={(e) => updateAddress({ email: e.target.value })} />
              <input placeholder="Street &amp; number" value={address.street} onChange={(e) => updateAddress({ street: e.target.value })} />
              <input placeholder="City" value={address.city} onChange={(e) => updateAddress({ city: e.target.value })} />
              <input placeholder="ZIP / Postcode" value={address.zip} onChange={(e) => updateAddress({ zip: e.target.value })} />
              <select value={address.country} onChange={(e) => updateAddress({ country: e.target.value })} aria-label="Country">
                {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" disabled={!address.name || !address.street || !address.city || !address.zip || !address.email.includes("@")} onClick={() => setStep(2)}>
              Continue to shipping
            </button>
          </section>
        ) : null}

        {step === 2 && quote ? (
          <section className="co-pane">
            <h3>Shipping method — {quote.tax.label}</h3>
            {quote.methods.map((m) => (
              <label key={m.id} className="ship-option">
                <input type="radio" name="method" checked={methodId === m.id} onChange={() => setMethodId(m.id)} />
                <span>{m.name}</span>
                <b>{m.finalPrice === 0 ? "Free" : formatMoney(m.finalPrice, currency)}</b>
              </label>
            ))}
            <p className="muted">Taxes &amp; duties for {quote.tax.country}: {quote.tax.label} — shown transparently before you pay (DDP).</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-outline" onClick={() => setStep(1)}>Back</button>
              <button className="btn btn-primary" disabled={!methodId} onClick={() => setStep(3)}>Continue to payment</button>
            </div>
          </section>
        ) : null}

        {step === 3 && totals ? (
          <section className="co-pane">
            <h3>Payment</h3>
            <div className="co-grid">
              <input placeholder="Card number (demo — not charged)" value={payment.card} onChange={(e) => setPayment({ ...payment, card: e.target.value })} />
              <input placeholder="MM/YY" value={payment.exp} onChange={(e) => setPayment({ ...payment, exp: e.target.value })} />
              <input placeholder="CVC" value={payment.cvc} onChange={(e) => setPayment({ ...payment, cvc: e.target.value })} />
            </div>
            <p className="muted">
              Demo payment stub — no real charge. Production wires Stripe PaymentIntent + webhook
              (Klarna/PayPal next, see modules/payment).
            </p>
            {error ? <p style={{ color: "#B23A2E", fontWeight: 600 }}>{error}</p> : null}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-outline" onClick={() => setStep(2)}>Back</button>
              <button
                className="btn btn-primary"
                disabled={busy || payment.card.replace(/\s/g, "").length < 12 || !payment.exp || payment.cvc.length < 3}
                onClick={placeOrder}
              >
                {busy ? "Placing…" : `Pay ${formatMoney(totals.total, currency)}`}
              </button>
            </div>
          </section>
        ) : null}
      </div>

      <aside className="cart-summary">
        <h3>Order total</h3>
        {totals ? (
          <>
            <div className="sum-row"><span>Subtotal</span><b>{formatMoney(totals.subtotal, currency)}</b></div>
            <div className="sum-row"><span>Shipping</span><b>{totals.shipping === 0 ? "Free" : formatMoney(totals.shipping, currency)}</b></div>
            <div className="sum-row"><span>{quote.tax.label}</span><b>{formatMoney(totals.tax, currency)}</b></div>
            <div className="sum-row total"><span>Total</span><b>{formatMoney(totals.total, currency)}</b></div>
          </>
        ) : (
          <p className="muted">Enter your address to see shipping &amp; taxes.</p>
        )}
        <p className="fit-strip" style={{ marginTop: 14 }}>
          <b>Fit Guarantee</b> — wrong size? Free exchange within 60 days. Duties shown upfront, no surprise fees.
        </p>
      </aside>
    </div>
  );
}
