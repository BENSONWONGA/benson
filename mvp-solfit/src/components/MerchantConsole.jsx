/**
 * components/MerchantConsole — 商家操作台（客户端轮询 /api/admin/overview）
 * 三视图：经营速览 / 订单发货（paid → shipped）/ 库存补货（低码一键补齐）。
 * 门禁：x-admin-token（骨架期默认 dev-admin-token，页面侧存 sessionStorage；
 * Phase 2 换正式 RBAC —— 商家角色挂 users 表 + 审计日志）。
 */

"use client";

import { useCallback, useEffect, useState } from "react";

const TOKEN_KEY = "solfit_admin_token";
const POLL_MS = 10000;

const STATUS_COLOR = {
  paid: "#D4880F",        // 待发货（黄）
  shipped: "var(--fit)",  // 已发货（绿）
  exchanged: "#C0392B",
  returned: "#C0392B",
  pending_payment: "var(--text-sub)",
  payment_failed: "#C0392B",
};

const fmtTime = (iso) => (iso || "").slice(0, 16).replace("T", " ");

export default function MerchantConsole() {
  const [token, setToken] = useState(null);
  const [input, setInput] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
  }, []);

  const load = useCallback(async (tk) => {
    try {
      const res = await fetch("/api/admin/overview", { headers: { "x-admin-token": tk }, cache: "no-store" });
      const body = await res.json();
      if (body.code !== 0) throw new Error(body.message || "bad response");
      setData(body.data);
      setError(null);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    load(token);
    const t = setInterval(() => load(token), POLL_MS);
    return () => clearInterval(t);
  }, [token, load]);

  async function unlock(e) {
    e.preventDefault();
    if (await load(input)) {
      sessionStorage.setItem(TOKEN_KEY, input);
      setToken(input);
    }
  }

  async function act(url, payload, key, okNote) {
    setBusy(key); setNotice(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (body.code !== 0) throw new Error(body.message);
      setNotice(okNote);
      await load(token);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  // ===== 未解锁：token 门 =====
  if (!token) {
    return (
      <div style={{ maxWidth: 420, margin: "40px auto 0" }}>
        <p className="eyebrow">Merchant console</p>
        <h1 style={{ fontSize: 32, margin: "0 0 20px" }}>Staff sign-in</h1>
        <form className="finder-form" onSubmit={unlock}>
          <label htmlFor="admin-token">Admin token</label>
          <input
            id="admin-token"
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="x-admin-token"
            required
          />
          {error && <p style={{ color: "#C0392B", fontSize: 13, margin: 0 }}>{error === "ADMIN_REQUIRED" ? "Wrong token." : error}</p>}
          <button className="btn btn-primary" type="submit" disabled={!input}>
            Unlock console
          </button>
        </form>
        <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>
          骨架期默认 token：<code className="mono">dev-admin-token</code>（生产用环境变量 <code className="mono">ADMIN_TOKEN</code> 覆盖）。
        </p>
      </div>
    );
  }

  if (!data) return <p className="muted">加载中…</p>;
  const { stats, orders, inventory } = data;
  const toShip = orders.filter((o) => o.status === "paid");

  return (
    <div>
      {/* ===== Tab 导航 ===== */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "28px 0 4px" }}>
        {[
          ["overview", `Overview`],
          ["orders", `Orders (${toShip.length} to ship)`],
          ["inventory", `Inventory (${stats.oosSizes} OOS)`],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`btn btn-sm ${tab === id ? "btn-primary" : "btn-outline"}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <button
          className="btn btn-sm btn-outline"
          style={{ marginLeft: "auto" }}
          onClick={() => { sessionStorage.removeItem(TOKEN_KEY); setToken(null); setData(null); }}
        >
          Lock
        </button>
      </div>
      {notice && <p style={{ color: "var(--fit)", fontSize: 13, margin: "10px 0" }}>✓ {notice}</p>}
      {error && <p style={{ color: "#C0392B", fontSize: 13, margin: "10px 0" }}>{error}</p>}

      {/* ===== Overview ===== */}
      {tab === "overview" && (
        <>
          <div className="baseline-kpis" style={{ gridTemplateColumns: "repeat(6, 1fr)", margin: "20px 0 8px" }}>
            <div className="stat-box"><div className="num">${stats.gmvUsd.toLocaleString()}</div><div className="lbl">GMV (USD)</div></div>
            <div className="stat-box"><div className="num">{stats.orders}</div><div className="lbl">Orders</div></div>
            <div className="stat-box"><div className="num" style={{ color: toShip.length ? "#D4880F" : undefined }}>{stats.toShip}</div><div className="lbl">To ship</div></div>
            <div className="stat-box"><div className="num" style={{ color: "var(--fit)" }}>{stats.shipped}</div><div className="lbl">Shipped</div></div>
            <div className="stat-box"><div className="num" style={{ color: stats.afterSales ? "#C0392B" : undefined }}>{stats.afterSales}</div><div className="lbl">After-sales (exchange/return)</div></div>
            <div className="stat-box"><div className="num" style={{ color: stats.oosSizes ? "#D4880F" : "var(--fit)" }}>{stats.oosSizes}</div><div className="lbl">OOS sizes</div></div>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>GMV 口径：已成交单（不含待支付/支付失败）· 注册用户 {stats.registeredUsers} · 数据 {POLL_MS / 1000}s 自动刷新</p>

          <h3 style={{ margin: "32px 0 12px" }}>Recent orders</h3>
          <OrderTable orders={orders.slice(0, 8)} busy={busy} onShip={(id) => shipOrder(id)} />
        </>
      )}

      {/* ===== Orders ===== */}
      {tab === "orders" && (
        <>
          <h3 style={{ margin: "28px 0 12px" }}>All orders — paid 行可直接发货（paid → shipped）</h3>
          <OrderTable orders={orders} busy={busy} onShip={(id) => shipOrder(id)} />
        </>
      )}

      {/* ===== Inventory ===== */}
      {tab === "inventory" && (
        <>
          <h3 style={{ margin: "28px 0 12px" }}>Stock matrix — 商品 × 尺码（0 红 · &lt;3 黄）</h3>
          {inventory.map((p) => {
            const lowCount = p.sizes.filter((s) => s.stock < 3).length;
            return (
              <div key={p.id} className="product-card" style={{ padding: 16, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <b>{p.name}</b> <span className="muted">· {p.category} · ${p.price}</span>
                  </div>
                  <button
                    className="btn btn-sm btn-outline"
                    disabled={busy === `restock-${p.id}` || !lowCount}
                    onClick={() =>
                      act("/api/admin/inventory", { action: "restock_low", productId: p.id }, `restock-${p.id}`,
                        `${p.name}：${lowCount} 个低库存尺码已补到 6`)
                    }
                  >
                    {busy === `restock-${p.id}` ? "…" : lowCount ? `Restock low (${lowCount})` : "Stock OK"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {p.sizes.map((s) => (
                    <div
                      key={s.size}
                      className="mono"
                      style={{
                        fontSize: 12, padding: "4px 8px", borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: s.stock === 0 ? "#C0392B" : s.stock < 3 ? "#D4880F" : "#EFE8DC",
                        color: s.stock < 3 ? "#fff" : "inherit",
                      }}
                      title={`EU ${s.size}`}
                    >
                      {s.size} · {s.stock}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );

  async function shipOrder(orderId) {
    await act("/api/admin/orders", { action: "mark_shipped", orderId }, `ship-${orderId}`, `${orderId} 已标记发货`);
  }
}

function OrderTable({ orders, busy, onShip }) {
  if (!orders.length) return <p className="muted">暂无订单（前台下一单试试，或用 /api/debug/seed-order 造数）</p>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: "left", color: "var(--text-sub)" }}>
          <th style={{ padding: "6px 0" }}>Order</th><th>Placed</th><th>Buyer</th><th>Region</th><th>Items</th><th>Total</th><th>Status</th><th></th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id} style={{ borderTop: "1px solid var(--border)" }}>
            <td style={{ padding: "8px 0", fontFamily: "var(--font-display)" }}>
              {o.id}{o.hasAccount ? <span title="注册用户下单"> ●</span> : null}
            </td>
            <td className="muted">{fmtTime(o.createdAt)}</td>
            <td>{o.name || "—"}<div className="muted" style={{ fontSize: 11 }}>{o.email}</div></td>
            <td>{o.country} · {o.region}</td>
            <td title={o.items.map((i) => `${i.name} EU${i.size} ×${i.qty}`).join("\n")}>
              {o.itemCount}
            </td>
            <td>{o.currency} {Number(o.total ?? 0).toFixed(2)}</td>
            <td style={{ color: STATUS_COLOR[o.status] || undefined, fontWeight: 600 }}>
              {o.status.replace(/_/g, " ")}
              {o.status === "shipped" && <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{fmtTime(o.shippedAt)}</div>}
            </td>
            <td style={{ textAlign: "right" }}>
              {o.status === "paid" ? (
                <button className="btn btn-sm btn-primary" disabled={busy === `ship-${o.id}`} onClick={() => onShip(o.id)}>
                  {busy === `ship-${o.id}` ? "…" : "Mark shipped"}
                </button>
              ) : (
                <span className="muted mono" style={{ fontSize: 11 }}>{o.tracking}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
