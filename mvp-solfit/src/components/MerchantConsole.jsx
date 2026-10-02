/**
 * components/MerchantConsole — 商家操作台（客户端轮询 /api/admin/overview）
 * 三视图：经营速览 / 订单发货（paid → shipped）/ 库存补货（低码一键补齐）。
 * 门禁：x-admin-token（骨架期默认 dev-admin-token，页面侧存 sessionStorage；
 * Phase 2 换正式 RBAC —— 商家角色挂 users 表 + 审计日志）。
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

/** 订单状态中文（后台全系中文口径） */
const ORDER_STATUS_ZH = {
  paid: "待发货",
  shipped: "已发货",
  exchanged: "已换货",
  returned: "已退货",
  pending_payment: "待支付",
  payment_failed: "支付失败",
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
  const postFormRef = useRef(null);                // Content：发布表单（AI 草稿回填目标）
  const [genBusy, setGenBusy] = useState(false);   // Content：AI 生成中
  const [genSource, setGenSource] = useState(null); // Content：草稿来源徽标（llm/template）

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
        <p className="eyebrow">商家操作台</p>
        <h1 style={{ fontSize: 32, margin: "0 0 20px" }}>员工登录</h1>
        <form className="finder-form" onSubmit={unlock}>
          <label htmlFor="admin-token">管理令牌</label>
          <input
            id="admin-token"
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="x-admin-token"
            required
          />
          {error && <p style={{ color: "#C0392B", fontSize: 13, margin: 0 }}>{error === "ADMIN_REQUIRED" ? "令牌错误" : error}</p>}
          <button className="btn btn-primary" type="submit" disabled={!input}>
            解锁后台
          </button>
        </form>
        <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>
          骨架期默认 token：<code className="mono">dev-admin-token</code>（生产用环境变量 <code className="mono">ADMIN_TOKEN</code> 覆盖）。
        </p>
      </div>
    );
  }

  if (!data) return <p className="muted">加载中…</p>;
  const { stats, orders, inventory, products, promos, posts, reviews, customers } = data;
  const toShip = orders.filter((o) => o.status === "paid");

  return (
    <div>
      {/* ===== Tab 导航 ===== */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "28px 0 4px" }}>
        {[
          ["overview", `经营速览`],
          ["orders", `订单 (${toShip.length} 待发货)`],
          ["inventory", `库存 (${stats.oosSizes} 缺码)`],
          ["catalog", `商品 (${(products || []).length})`],
          ["promos", `优惠码 (${(promos || []).length})`],
          ["content", `内容 (${(posts || []).length})`],
          ["reviews", `评价 (${(reviews || []).length})`],
          ["customers", `会员 (${(customers || []).length})`],
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
          锁定
        </button>
      </div>
      {notice && <p style={{ color: "var(--fit)", fontSize: 13, margin: "10px 0" }}>✓ {notice}</p>}
      {error && <p style={{ color: "#C0392B", fontSize: 13, margin: "10px 0" }}>{error}</p>}

      {/* ===== Overview ===== */}
      {tab === "overview" && (
        <>
          <div className="baseline-kpis" style={{ gridTemplateColumns: "repeat(4, 1fr)", margin: "20px 0 8px" }}>
            <div className="stat-box"><div className="num">${stats.gmvUsd.toLocaleString()}</div><div className="lbl">成交额 GMV (USD)</div></div>
            <div className="stat-box">
              <div className="num">${(stats.marginUsd ?? 0).toLocaleString()}</div>
              <div className="lbl">毛利（成本 ${ (stats.cogsUsd ?? 0).toLocaleString() }）</div>
            </div>
            <div className="stat-box"><div className="num">{stats.marginPct ?? 0}%</div><div className="lbl">毛利率</div></div>
            <div className="stat-box"><div className="num">{stats.orders}</div><div className="lbl">订单数</div></div>
            <div className="stat-box"><div className="num" style={{ color: toShip.length ? "#D4880F" : undefined }}>{stats.toShip}</div><div className="lbl">待发货</div></div>
            <div className="stat-box"><div className="num" style={{ color: "var(--fit)" }}>{stats.shipped}</div><div className="lbl">已发货</div></div>
            <div className="stat-box"><div className="num" style={{ color: stats.afterSales ? "#C0392B" : undefined }}>{stats.afterSales}</div><div className="lbl">售后（换货/退货）</div></div>
            <div className="stat-box"><div className="num" style={{ color: stats.oosSizes ? "#D4880F" : "var(--fit)" }}>{stats.oosSizes}</div><div className="lbl">缺码尺码数</div></div>
            <div className="stat-box"><div className="num">{stats.products ?? "—"}{stats.unlisted ? <span className="muted" style={{ fontSize: 13 }}>（{stats.unlisted} 已下架）</span> : null}</div><div className="lbl">商品（在售 + 下架）</div></div>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>GMV 口径：已成交单（不含待支付/支付失败）· 注册用户 {stats.registeredUsers} · 数据 {POLL_MS / 1000}s 自动刷新</p>

          <h3 style={{ margin: "32px 0 12px" }}>近期订单</h3>
          <OrderTable orders={orders.slice(0, 8)} busy={busy} onShip={(id) => shipOrder(id)} />
        </>
      )}

      {/* ===== Orders ===== */}
      {tab === "orders" && (
        <>
          <h3 style={{ margin: "28px 0 12px" }}>全部订单 — 已支付行可直接发货（paid → shipped）</h3>
          <OrderTable orders={orders} busy={busy} onShip={(id) => shipOrder(id)} />
        </>
      )}

      {/* ===== Inventory ===== */}
      {tab === "inventory" && (
        <>
          <h3 style={{ margin: "28px 0 12px" }}>库存矩阵 — 商品 × 尺码（0 红 · &lt;3 黄）</h3>
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
                    {busy === `restock-${p.id}` ? "…" : lowCount ? `补齐低库存（${lowCount}）` : "库存正常"}
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
            <h3 style={{ margin: 0 }}>商品管理 — 共 {(products || []).length} 个（{stats.unlisted ?? 0} 个已下架）</h3>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => { setEditing(null); setFormOpen(!formOpen); }}
            >
              {formOpen && !editing ? "收起表单" : "+ 新建商品"}
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
                <th style={{ padding: "6px 0" }}>商品</th><th>类目</th><th>售价</th><th>库存</th><th>评分</th><th>状态</th><th>更新</th><th></th>
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
                  <td style={{ fontWeight: 600, color: p.listed ? "var(--fit)" : "var(--text-sub)" }}>{p.listed ? "在售" : "已下架"}</td>
                  <td className="muted" style={{ fontSize: 11 }}>{p.createdAt ? p.createdAt.slice(0, 10) : "种子"}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      className="btn btn-sm btn-outline"
                      disabled={busy === `prod-${p.id}`}
                      onClick={() => { setEditing(p); setFormOpen(true); window.scrollTo(0, 0); }}
                    >
                      编辑
                    </button>{" "}
                    <button
                      className={`btn btn-sm ${p.listed ? "btn-outline" : "btn-primary"}`}
                      disabled={busy === `prod-${p.id}`}
                      onClick={() =>
                        act("/api/admin/products", { action: p.listed ? "unlist" : "list", id: p.id }, `prod-${p.id}`,
                          `${p.name} ${p.listed ? "已下架（前台即刻不可见）" : "已重新上架"}`)
                      }
                    >
                      {busy === `prod-${p.id}` ? "…" : p.listed ? "下架" : "上架"}
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
          <h3 style={{ margin: "28px 0 12px" }}>优惠码 — 结算页验签计价，订单落码可对账</h3>
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
            <div><label>优惠码</label><input name="code" placeholder="WELCOME10" required /></div>
            <div><label>类型</label>
              <select name="type" defaultValue="percent">
                <option value="percent">百分比 (%)</option>
                <option value="fixed">固定金额 ($)</option>
              </select>
            </div>
            <div><label>面额</label><input name="value" type="number" step="0.01" min="0.01" placeholder="10" required /></div>
            <div><label>最低消费 ($)</label><input name="minSpend" type="number" step="0.01" min="0" placeholder="0" /></div>
            <div><label>次数上限（0=不限）</label><input name="maxUses" type="number" min="0" placeholder="0" /></div>
            <button className="btn btn-sm btn-primary" type="submit" disabled={busy === "promo-save"}>
              {busy === "promo-save" ? "…" : "创建优惠码"}
            </button>
          </form>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-sub)" }}>
                <th style={{ padding: "6px 0" }}>优惠码</th><th>类型</th><th>面额</th><th>门槛</th><th>已用/上限</th><th>状态</th><th></th>
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
                  <td style={{ fontWeight: 600, color: p.active ? "var(--fit)" : "var(--text-sub)" }}>{p.active ? "启用中" : "已停用"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className={`btn btn-sm ${p.active ? "btn-outline" : "btn-primary"}`}
                      disabled={busy === `promo-${p.code}`}
                      onClick={() =>
                        act("/api/admin/promos", { action: p.active ? "deactivate" : "activate", code: p.code }, `promo-${p.code}`,
                          `${p.code} ${p.active ? "已停用" : "已启用"}`)
                      }
                    >
                      {busy === `promo-${p.code}` ? "…" : p.active ? "停用" : "启用"}
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

      {/* ===== Content（Phase 20：SEO 内容运营 · Phase 2+：AIGC 流水线）===== */}
      {tab === "content" && (
        <>
          <h3 style={{ margin: "28px 0 4px" }}>Content — 期刊文章（SEO 长尾词入口，Article JSON-LD 自动注入）</h3>
          <p className="muted" style={{ fontSize: 12, margin: "0 0 14px" }}>
            新建即发布（slug 冲突自动加后缀）；Unpublish 后文章即刻退出前台与 sitemap。正文用空行分段。
          </p>

          {/* AI 草稿生成器 —— 人审流水线：生成只回填表单，编辑后才可发布 */}
          <form
            className="product-card"
            style={{ padding: 18, marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", borderColor: "var(--fit)" }}
            onSubmit={async (e) => {
              e.preventDefault();
              const topic = e.target.elements.topic.value;
              const productId = e.target.elements.productId.value;
              if (!topic) return;
              setGenBusy(true);
              setGenSource(null);
              try {
                const res = await fetch("/api/ai/content/generate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-admin-token": token },
                  body: JSON.stringify({ mode: "seo_post", topic, productId: productId || undefined }),
                });
                const body = await res.json();
                if (body.code !== 0) throw new Error(body.message);
                const d = body.data;
                const f = postFormRef.current.elements; // 回填发布表单 —— 商家编辑（人审）后手动 Publish
                f.title.value = d.title;
                f.excerpt.value = d.excerpt;
                f.tags.value = (d.tags || []).join(", ");
                f.body.value = d.body;
                setGenSource(d.source);
                setNotice(`AI 草稿已生成（${d.source === "llm" ? "LLM" : "模板兜底"}）—— 请审校下方表单后发布`);
                window.scrollTo(0, 0);
              } catch (err) {
                setError(err.message);
              } finally {
                setGenBusy(false);
              }
            }}
          >
            <div style={{ flex: "3 1 280px" }}>
              <label>AI 草稿 — 主题 / 长尾关键词</label>
              <input name="topic" placeholder="how to clean suede shoes" required />
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label>聚焦商品（可选）</label>
              <select name="productId" defaultValue="">
                <option value="">自动匹配</option>
                {(products || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <button className="btn btn-sm btn-primary" type="submit" disabled={genBusy}>
              {genBusy ? "生成中…" : "生成草稿"}
            </button>
            <p className="muted" style={{ width: "100%", margin: 0, fontSize: 11 }}>
              人审铁律：生成结果只回填下方表单，审校/改写后才发布（内容质量挂钩退货率与站点 E-E-A-T）。未配 LLM_API_KEY 时走模板兜底。
            </p>
          </form>

          <form
            ref={postFormRef}
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
              <div style={{ flex: "2 1 240px" }}><label>标题</label><input name="title" placeholder="How to measure your feet at home" required /></div>
              <div style={{ flex: "1 1 180px" }}><label>标签（逗号分隔）</label><input name="tags" placeholder="fit guide, wide feet" /></div>
            </div>
            <div><label>摘要（≤200 字，作 meta description）</label><input name="excerpt" placeholder="留空则自动截取正文" /></div>
            <div><label>封面图 URL</label><input name="cover" placeholder="https://…" /></div>
            <div><label>正文（空行分段）</label><textarea name="body" rows={5} placeholder="写下这篇指南…" required style={{ width: "100%", fontFamily: "inherit" }} /></div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {genSource && (
                <span className="chip" style={{ fontSize: 11, padding: "3px 10px", background: "var(--fit)", color: "#fff", border: "none" }}>
                  {genSource === "llm" ? "AI 草稿 · 审校后发布" : "模板草稿 · 可再生成"}
                </span>
              )}
              <button className="btn btn-sm btn-primary" type="submit" disabled={busy === "post-save"}>
                {busy === "post-save" ? "…" : "发布文章"}
              </button>
            </div>
          </form>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-sub)" }}>
                <th style={{ padding: "6px 0" }}>文章</th><th>标签</th><th>字数</th><th>状态</th><th>更新时间</th><th></th>
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
                  <td style={{ fontWeight: 600, color: p.published ? "var(--fit)" : "var(--text-sub)" }}>{p.published ? "已上线" : "已下线"}</td>
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
                      {busy === `post-${p.slug}` ? "…" : p.published ? "下线" : "上线"}
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

      {/* ===== Reviews（评价审核）===== */}
      {tab === "reviews" && (
        <>
          <h3 style={{ margin: "28px 0 4px" }}>评价管理 — 已购验证 UGC（删除即回写商品评分聚合）</h3>
          <p className="muted" style={{ fontSize: 12, margin: "0 0 14px" }}>
            全部评价均过已购验证（未购提交在源头拦截）；删除用于违规内容审核，评分/合脚统计即刻重算。
          </p>
          {(reviews || []).length ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-sub)" }}>
                  <th style={{ padding: "6px 0" }}>评价内容</th><th>商品</th><th>评分</th><th>合脚度</th><th>作者</th><th>时间</th><th></th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 0", maxWidth: 320 }}>
                      {r.title ? <b>{r.title}</b> : <span className="muted">（无标题）</span>}
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {r.body.length > 90 ? r.body.slice(0, 90) + "…" : r.body}
                      </div>
                    </td>
                    <td><a href={`/product/${r.productId}`} target="_blank">{r.productName}</a></td>
                    <td style={{ color: r.rating >= 4 ? "var(--fit)" : r.rating <= 2 ? "#C0392B" : "#D4880F", fontWeight: 700 }}>
                      {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                    </td>
                    <td className="muted">{r.fit === "too_small" ? "偏小" : r.fit === "too_large" ? "偏大" : r.fit === "true_to_size" ? "正码" : "—"}</td>
                    <td className="muted">{r.author}{r.verified ? <span title="已购验证" style={{ color: "var(--fit)" }}> ●</span> : null}</td>
                    <td className="muted" style={{ fontSize: 11 }}>{fmtTime(r.createdAt)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn btn-sm btn-outline"
                        style={{ color: "#C0392B", borderColor: "#C0392B" }}
                        disabled={busy === `rev-${r.id}`}
                        onClick={() =>
                          act("/api/admin/reviews", { action: "remove", reviewId: r.id }, `rev-${r.id}`,
                            `评价已删除（${r.productName} 评分聚合已重算）`)
                        }
                      >
                        {busy === `rev-${r.id}` ? "…" : "删除"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">暂无评价 —— 前台买一单后即可评（前台评价表单在商品页底部）</p>
          )}
        </>
      )}

      {/* ===== Customers（会员名册 · CRM）===== */}
      {tab === "customers" && (
        <>
          <h3 style={{ margin: "28px 0 4px" }}>会员名册 — 等级按累计实付派生（不可手改）</h3>
          <p className="muted" style={{ fontSize: 12, margin: "0 0 14px" }}>
            Member $0 · Silver $300（1.5× 积分）· Gold $800（2×）。手动调积分用于客诉补偿/活动奖励 —— 全程埋点可审计。
          </p>
          {(customers || []).length ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-sub)" }}>
                  <th style={{ padding: "6px 0" }}>会员</th><th>等级</th><th>积分</th><th>累计消费</th><th>订单</th><th>注册时间</th><th>积分调整</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 0" }}>
                      <b>{c.name || "—"}</b>
                      <div className="muted" style={{ fontSize: 11 }}>{c.email}</div>
                    </td>
                    <td style={{ fontWeight: 700, color: c.tier === "Gold" ? "#D4880F" : c.tier === "Silver" ? "var(--text-sub)" : undefined }}>
                      {c.tier}{c.multiplier > 1 ? <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}> · {c.multiplier}×</span> : null}
                    </td>
                    <td style={{ fontWeight: 700 }}>{c.points.toLocaleString()}</td>
                    <td className="muted">${c.lifetimeSpend.toLocaleString()}</td>
                    <td className="muted">{c.orders}{c.lastOrderAt ? <div style={{ fontSize: 11 }}>{fmtTime(c.lastOrderAt).slice(0, 10)}</div> : null}</td>
                    <td className="muted" style={{ fontSize: 11 }}>{c.joinedAt.slice(0, 10)}</td>

                    <td>
                      <form
                        style={{ display: "flex", gap: 6, alignItems: "center" }}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const delta = Number(e.target.elements.delta.value);
                          if (!delta) return;
                          act("/api/admin/customers",
                            { action: "adjust_points", userId: c.id, delta, reason: "console" },
                            `pts-${c.id}`, `${c.email} 积分 ${delta > 0 ? "+" : ""}${delta} → ${Math.max(0, c.points + delta)}`);
                          e.target.elements.delta.value = "";
                        }}
                      >
                        <input
                          name="delta" type="number" placeholder="±500" style={{ width: 76 }}
                          disabled={busy === `pts-${c.id}`}
                        />
                        <button className="btn btn-sm btn-outline" type="submit" disabled={busy === `pts-${c.id}`}>
                          {busy === `pts-${c.id}` ? "…" : "调整"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">暂无注册会员 —— 前台注册一个账户试试（积分赚取从下单/评价开始）</p>
          )}
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
          <th style={{ padding: "6px 0" }}>订单号</th><th>下单时间</th><th>买家</th><th>地区</th><th>商品</th><th>金额</th><th>状态</th><th></th>
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
              {ORDER_STATUS_ZH[o.status] || o.status.replace(/_/g, " ")}
              {o.status === "shipped" && <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{fmtTime(o.shippedAt)}</div>}
            </td>
            <td style={{ textAlign: "right" }}>
              {o.status === "paid" ? (
                <button className="btn btn-sm btn-primary" disabled={busy === `ship-${o.id}`} onClick={() => onShip(o.id)}>
                  {busy === `ship-${o.id}` ? "…" : "标记发货"}
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
      <b>{isEdit ? `编辑商品 — ${initial.name}` : "新建商品"}</b>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12 }}>
        <div><label>名称 *</label><input name="name" defaultValue={val("name")} required /></div>
        <div><label>类目 *</label><input name="category" defaultValue={val("category")} placeholder="Loafers / Sneakers / Boots…" required /></div>
        <div><label>售价 (USD) *</label><input name="price" type="number" step="0.01" min="1" defaultValue={initial ? initial.price : ""} required /></div>
        <div><label>划线价 (USD)</label><input name="compareAt" type="number" step="0.01" min="0" defaultValue={initial ? initial.compareAt ?? "" : ""} placeholder="可空" /></div>
        <div><label>跟高</label><input name="heel" defaultValue={val("heel") || "Flat"} /></div>
        <div><label>宽窄（逗号分隔）</label><input name="widths" defaultValue={val("widths") || "Standard"} placeholder="Standard, Wide" /></div>
        <div><label>楦型 *</label>
          <select name="lastCode" defaultValue={val("lastCode")} required disabled={isEdit} title={isEdit ? "楦型建档后不可改（尺码引擎依赖）" : ""}>
            {LAST_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {!isEdit && (
          <div><label>尺码（逗号分隔）*</label><input name="sizes" placeholder="36, 37, 38, 39, 40" required /></div>
        )}
        <div style={{ gridColumn: "1 / -1" }}><label>商品图 URL</label><input name="image" defaultValue={val("image")} placeholder="https://…" /></div>
        <div style={{ gridColumn: "1 / -1" }}><label>描述</label><input name="desc" defaultValue={val("desc")} /></div>
        <div style={{ gridColumn: "1 / -1" }}><label>卖点（逗号分隔）</label><input name="features" defaultValue={val("features")} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "保存中…" : isEdit ? "保存修改" : "创建商品"}</button>
        <button className="btn btn-outline" type="button" onClick={onCancel}>取消</button>
      </div>
    </form>
  );
}
