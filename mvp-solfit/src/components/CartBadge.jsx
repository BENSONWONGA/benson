/**
 * components/CartBadge — 购物车计数徽标（客户端小岛）
 * 会话购物车在服务端（modules/cart），徽标通过 GET /api/cart 拉取
 */

"use client";

import { useEffect, useState } from "react";

export default function CartBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    const refresh = () =>
      fetch("/api/cart")
        .then((r) => r.json())
        .then((j) => mounted && setCount((j.data?.items || []).reduce((s, i) => s + i.qty, 0)))
        .catch(() => {});
    refresh();
    window.addEventListener("solfit:cart", refresh);
    return () => {
      mounted = false;
      window.removeEventListener("solfit:cart", refresh);
    };
  }, []);

  return (
    <span style={{ fontSize: 14, fontWeight: 600 }}>
      Bag
      <span className="cart-badge">{count}</span>
    </span>
  );
}
