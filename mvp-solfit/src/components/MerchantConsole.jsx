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
  const [formOpen, setFormOpen] = useState(false); // Catalog：新建/编辑表单开关
  const [editing, setEditing] = useState(null);    // Catalog：正在编辑的商品（null=新建）

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
  const { stats, orders, inventory, products, promos, posts } = data;
  const toShip = orders.filter((o) => o.status === "paid");

  return (
    <div>
      {/* ===== Tab 导航 ===== */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "28px 0 4px" }}>
        {[
          ["overview", `Overview`],
          ["orders", `Orders (${toShip.length} to ship)`],
          ["inventory", `Inventory (${stats.oosSizes} OOS)`],
          ["catalog", `Catalog (${(products || []).length})`],
          ["promos", `Promos (${(promos || []).length})`],
          ["content", `Content (${(posts || []).length})`],
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
            <div className="stat-box"><div className="num">{stats.products ?? "—"}{stats.unlisted ? <span className="muted" style={{ fontSize: 13 }}> ({stats.unlisted} off)</span> : null}</div><div className="lbl">Products (listed + off)</div></div>
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

      {/* ===== Catalog（Phase 17：商品运营）===== */}
      {tab === "catalog" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "28px 0 12px" }}>
            <h3 style={{ margin: 0 }}>Catalog — {(products || []).length} products（{stats.unlisted ?? 0} unlisted）</h3>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => { setEditing(null); setFormOpen(!formOpen); }}
            >
              {formOpen && !editing ? "Close form" : "+ New product"}
            </button>
          </div>

          {formOpen && (
            <ProductForm
              key={editing ? `edit-${editing.id}` : "new"}
              initial={editing}
              busy={busy === "prod-save"}
              onCancel={() => { setFormOpen(false); setEditing(null); }}
              onSubmit={async (fields) => {
                await act("/api/admin/products",
                  editing
                    ? { action: "update", id: editing.id, patch: fields }
                    : { action: "create", ...fields },
                  "prod-save",
                  editing ? `${editing.name} 已更新` : `${fields.name} 已创建（每码初始库存 6）`);
                setFormOpen(false);
                setEditing(null);
              }}
            />
          )}

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-sub)" }}>
                <th style={{ padding: "6px 0" }}>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Rating</th><th>Status</th><th>Updated</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(products || []).map((p) => (
                <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 0" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8 }} />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: 8, background: "#EFE8DC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }} className="muted">n/a</div>
                      )}
                      <div>
                        <a href={`/product/${p.id}`} target="_blank" style={{ fontWeight: 700 }}>{p.name}</a>
                        <div className="muted" style={{ fontSize: 11 }}>#{p.id} · {p.sizes.length} sizes · last {p.lastCode}{p.oosCount ? ` · ${p.oosCount} OOS` : ""}</div>
                      </div>
                    </div>
                  </td>
                  <td>{p.category}<div className="muted" style={{ fontSize: 11 }}>{p.heel} · {p.widths.join("/")}</div></td>
                  <td>${Number(p.price).toFixed(0)}{p.compareAt ? <div className="muted" style={{ fontSize: 11, textDecoration: "line-through" }}>${Number(p.compareAt).toFixed(0)}</div> : null}</td>
                  <td style={{ color: p.stock === 0 ? "#C0392B" : p.oosCount ? "#D4880F" : undefined }}>{p.stock}</td>
                  <td className="muted">{p.rating ? `${p.rating.toFixed(1)} (${p.reviewsCount})` : "—"}</td>
                  <td style={{ fontWeight: 600, color: p.listed ? "var(--fit)" : "var(--text-sub)" }}>{p.listed ? "listed" : "unlisted"}</td>
                  <td className="muted" style={{ fontSize: 11 }}>{p.createdAt ? p.createdAt.slice(0, 10) : "seed"}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      className="btn btn-sm btn-outline"
                      disabled={busy === `prod-${p.id}`}
                      onClick={() => { setEditing(p); setFormOpen(true); window.scrollTo(0, 0); }}
                    >
                      Edit
                    </button>{" "}
                    <button
                      className={`btn btn-sm ${p.listed ? "btn-outline" : "btn-primary"}`}
                      disabled={busy === `prod-${p.id}`}
                      onClick={() =>
                        act("/api/admin/products", { action: p.listed ? "unlist" : "list", id: p.id }, `prod-${p.id}`,
                          `${p.name} ${p.listed ? "已下架（前台即刻不可见）" : "已重新上架"}`)
                      }
                    >
                      {busy === `prod-${p.id}` ? "…" : p.listed ? "Unlist" : "List"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ===== Promos（Phase 19：优惠码运营）===== */}
      {tab === "promos" && (
        <>
          <h3 style={{ margin: "28px 0 12px" }}>Promo codes — 结算页验签计价，订单落码可对账</h3>
          <form
            className="product-card"
            style={{ padding: 18, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}
            onSubmit={(e) => {
              e.preventDefault();
              const f = e.target.elements;
              act("/api/admin/promos", {
                action: "create",
                code: f.code.value, type: f.type.value, value: Number(f.value.value),
                minSpend: Number(f.minSpend.value) || 0, maxUses: Number(f.maxUses.value) || 0,
              }, "promo-save", `优惠码 ${String(f.code.value).toUpperCase()} 已创建`);
            }}
          >
            <div><label>Code</label><input name="code" placeholder="WELCOME10" required /></div>
            <div><label>Type</label>
              <select name="type" defaultValue="percent">
                <option value="percent">percent (%)</option>
                <option value="fixed">fixed ($)</option>
              </select>
            </div>
            <div><label>Value</label><input name="value" type="number" step="0.01" min="0.01" placeholder="10" required /></div>
            <div><label>Min spend ($)</label><input name="minSpend" type="number" step="0.01" min="0" placeholder="0" /></div>
            <div><label>Max uses (0=∞)</label><input name="maxUses" type="number" min="0" placeholder="0" /></div>
            <button className="btn btn-sm btn-primary" type="submit" disabled={busy === "promo-save"}>
              {busy === "promo-save" ? "…" : "Create promo"}
            </button>
          </form>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-sub)" }}>
                <th style={{ padding: "6px 0" }}>Code</th><th>Type</th><th>Value</th><th>Min spend</th><th>Uses</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(promos || []).length ? promos.map((p) => (
                <tr key={p.code} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 0", fontFamily: "var(--font-display)", fontWeight: 700 }}>{p.code}{p.label ? <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{p.label}</div> : null}</td>
                  <td>{p.type}</td>
                  <td>{p.type === "percent" ? `${p.value}%` : `$${p.value}`}</td>
                  <td className="muted">{p.minSpend ? `$${p.minSpend}` : "—"}</td>
                  <td className="muted">{p.usedCount}{p.maxUses ? ` / ${p.maxUses}` : ""}</td>
                  <td style={{ fontWeight: 600, color: p.active ? "var(--fit)" : "var(--text-sub)" }}>{p.active ? "active" : "disabled"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className={`btn btn-sm ${p.active ? "btn-outline" : "btn-primary"}`}
                      disabled={busy === `promo-${p.code}`}
                      onClick={() =>
                        act("/api/admin/promos", { action: p.active ? "deactivate" : "activate", code: p.code }, `promo-${p.code}`,
                          `${p.code} ${p.active ? "已停用" : "已启用"}`)
                      }
                    >
                      {busy === `promo-${p.code}` ? "…" : p.active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="muted" style={{ padding: "10px 0" }}>暂无优惠码 —— 上方表单创建一个（如 WELCOME10 → 10%）</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {/* ===== Content（Phase 20：SEO 内容运营）===== */}
      {tab === "content" && (
        <>
          <h3 style={{ margin: "28px 0 4px" }}>Content — 期刊文章（SEO 长尾词入口，Article JSON-LD 自动注入）</h3>
          <p className="muted" style={{ fontSize: 12, margin: "0 0 14px" }}>
            新建即发布（slug 冲突自动加后缀）；Unpublish 后文章即刻退出前台与 sitemap。正文用空行分段。
          </p>

          <form
            className="product-card"
            style={{ padding: 18, marginBottom: 16, display: "grid", gap: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              const f = e.target.elements;
              act("/api/admin/posts", {
                action: "create",
                title: f.title.value, body: f.body.value,
                excerpt: f.excerpt.value, tags: f.tags.value, cover: f.cover.value,
              }, "post-save", `文章《${f.title.value}》已发布`).then(() => e.target.reset());
            }}
          >
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "2 1 240px" }}><label>Title</label><input name="title" placeholder="How to measure your feet at home" required /></div>
              <div style={{ flex: "1 1 180px" }}><label>Tags (comma sep)</label><input name="tags" placeholder="fit guide, wide feet" /></div>
            </div>
            <div><label>Excerpt (≤200 chars, meta description)</label><input name="excerpt" placeholder="Optional — auto-generated from body if empty" /></div>
            <div><label>Cover image URL</label><input name="cover" placeholder="https://…" /></div>
            <div><label>Body (blank line = new paragraph)</label><textarea name="body" rows={5} placeholder="Write the guide…" required style={{ width: "100%", fontFamily: "inherit" }} /></div>
            <button className="btn btn-sm btn-primary" type="submit" disabled={busy === "post-save"}>
              {busy === "post-save" ? "…" : "Publish article"}
            </button>
          </form>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-sub)" }}>
                <th style={{ padding: "6px 0" }}>Article</th><th>Tags</th><th>Words</th><th>Status</th><th>Updated</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(posts || []).length ? posts.map((p) => (
                <tr key={p.slug} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 0" }}>
                    <a href={`/blog/${p.slug}`} target="_blank" style={{ fontWeight: 700 }}>{p.title}</a>
                    <div className="muted" style={{ fontSize: 11 }}>/blog/{p.slug} · {p.excerpt.slice(0, 60)}{p.excerpt.length > 60 ? "…" : ""}</div>
                  </td>
                  <td className="muted">{(p.tags || []).join(", ") || "—"}</td>
                  <td className="muted">{p.wordCount}</td>
                  <td style={{ fontWeight: 600, color: p.published ? "var(--fit)" : "var(--text-sub)" }}>{p.published ? "live" : "offline"}</td>
                  <td className="muted" style={{ fontSize: 11 }}>{fmtTime(p.updatedAt)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className={`btn btn-sm ${p.published ? "btn-outline" : "btn-primary"}`}
                      disabled={busy === `post-${p.slug}`}
                      onClick={() =>
                        act("/api/admin/posts", { action: p.published ? "unpublish" : "publish", slug: p.slug }, `post-${p.slug}`,
                          `《${p.title}》${p.published ? "已下线（退出前台与 sitemap）" : "已上线"}`)
                      }
                    >
                      {busy === `post-${p.slug}` ? "…" : p.published ? "Unpublish" : "Publish"}
                    </button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="muted" style={{ padding: "10px 0" }}>暂无文章 —— 上方表单发一篇试试</td></tr>
              )}
            </tbody>
          </table>
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

/**
 * 商品新建/编辑表单（uncontrolled —— 提交时读表单元素，字段多时比受控省样板）。
 * 编辑模式：sizes/楦型外可改；sizes 建档后定死（库存矩阵/评价归属依赖它）。
 * 楦型代码镜像 catalog 域 LAST_LIBRARY（客户端组件不引服务端依赖图）。
 */
const LAST_CODES = ["W1", "W2", "W3", "W4", "H1", "H2", "B1", "F1", "F2"];

function ProductForm({ initial, busy, onSubmit, onCancel }) {
  const isEdit = !!initial;
  function submit(e) {
    e.preventDefault();
    const f = e.target.elements;
    const fields = {
      name: f.name.value,
      category: f.category.value,
      price: Number(f.price.value),
      compareAt: f.compareAt.value ? Number(f.compareAt.value) : null,
      heel: f.heel.value,
      widths: f.widths.value,
      image: f.image.value,
      desc: f.desc.value,
      features: f.features.value,
      lastCode: f.lastCode.value,
    };
    if (!isEdit) fields.sizes = f.sizes.value;
    onSubmit(fields);
  }
  const val = (k) => (initial ? (Array.isArray(initial[k]) ? initial[k].join(", ") : initial[k] ?? "") : "");
  return (
    <form className="product-card" style={{ padding: 20, marginBottom: 16 }} onSubmit={submit}>
      <b>{isEdit ? `Edit — ${initial.name}` : "New product"}</b>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12 }}>
        <div><label>Name *</label><input name="name" defaultValue={val("name")} required /></div>
        <div><label>Category *</label><input name="category" defaultValue={val("category")} placeholder="Loafers / Sneakers / Boots…" required /></div>
        <div><label>Price (USD) *</label><input name="price" type="number" step="0.01" min="1" defaultValue={initial ? initial.price : ""} required /></div>
        <div><label>Compare-at (USD)</label><input name="compareAt" type="number" step="0.01" min="0" defaultValue={initial ? initial.compareAt ?? "" : ""} placeholder="划线价（可空）" /></div>
        <div><label>Heel</label><input name="heel" defaultValue={val("heel") || "Flat"} /></div>
        <div><label>Widths（逗号分隔）</label><input name="widths" defaultValue={val("widths") || "Standard"} placeholder="Standard, Wide" /></div>
        <div><label>Last（楦型）*</label>
          <select name="lastCode" defaultValue={val("lastCode")} required disabled={isEdit} title={isEdit ? "楦型建档后不可改（尺码引擎依赖）" : ""}>
            {LAST_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {!isEdit && (
          <div><label>Sizes（逗号分隔）*</label><input name="sizes" placeholder="36, 37, 38, 39, 40" required /></div>
        )}
        <div style={{ gridColumn: "1 / -1" }}><label>Image URL</label><input name="image" defaultValue={val("image")} placeholder="https://…" /></div>
        <div style={{ gridColumn: "1 / -1" }}><label>Description</label><input name="desc" defaultValue={val("desc")} /></div>
        <div style={{ gridColumn: "1 / -1" }}><label>Features（逗号分隔）</label><input name="features" defaultValue={val("features")} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : isEdit ? "Save changes" : "Create product"}</button>
        <button className="btn btn-outline" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
