/**
 * components/CurrencySwitcher — 多币种切换（cookie 持久化 + 整页刷新生效）
 * 注意：document 只能在 useEffect 中访问（SSR 安全）
 */

"use client";

import { useEffect, useState } from "react";
import { CURRENCIES } from "@/lib/currency";

export default function CurrencySwitcher() {
  const [cur, setCur] = useState("USD");

  useEffect(() => {
    const m = document.cookie.match(/solfit_currency=(\w+)/);
    if (m && m[1] !== cur) setCur(m[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function change(e) {
    document.cookie = "solfit_currency=" + e.target.value + ";path=/;max-age=31536000;samesite=lax";
    location.reload();
  }

  return (
    <select
      aria-label="Currency"
      onChange={change}
      value={cur}
      style={{ height: 34, borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", padding: "0 10px", fontSize: 12, fontWeight: 600 }}
    >
      {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
    </select>
  );
}
