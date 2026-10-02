/**
 * components/admin/AdminShell — 商家后台完整版框架（客户端）
 * 登录门 + 深色侧边栏（分组导航）+ 顶栏（标题/刷新/锁定）+ 页面容器。
 * 令牌进 React Context（ui.jsx useAdmin），页面组件零样板取 token。
 * 侧边栏含跨模块入口：总后台 / 监控 / 基线（老板视角一站式）。
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AdminProvider, TOKEN_KEY, useOverview, Badge } from "@/components/admin/ui";

/** 侧边栏信息架构：概览 → 销售 → 商品 → 客户与营销 → 品牌 → 数据与系统 */
const NAV = [
  { group: "概览", items: [["/admin/merchant", "仪表盘"]] },
  {
    group: "销售",
    items: [
      ["/admin/merchant/orders", "订单管理"],
      ["/admin/merchant/reviews", "评价管理"],
    ],
  },
  {
    group: "商品",
    items: [
      ["/admin/merchant/products", "商品管理"],
      ["/admin/merchant/inventory", "库存管理"],
    ],
  },
  {
    group: "客户与营销",
    items: [
      ["/admin/merchant/customers", "会员管理"],
      ["/admin/merchant/promos", "优惠码"],
      ["/admin/merchant/content", "内容营销"],
    ],
  },
  { group: "品牌", items: [["/admin/merchant/branding", "品牌装修"]] },
  {
    group: "数据与系统",
    items: [
      ["/admin/merchant/analytics", "数据分析"],
      ["/admin/master", "总后台"],
      ["/admin/monitoring", "监控看板"],
      ["/admin/baseline", "基线看板"],
    ],
  },
];

export default function AdminShell({ children }) {
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!token) return <Gate onUnlock={setToken} />;

  return (
    <AdminProvider value={{ token }}>
      <div className="adm-shell">
        <Sidebar />
        <div className="adm-main">
          <Topbar onLock={() => { sessionStorage.removeItem(TOKEN_KEY); setToken(null); }} />
          <div className="adm-content">{children}</div>
        </div>
      </div>
    </AdminProvider>
  );
}

/* ===== 登录门 ===== */
function Gate({ onUnlock }) {
  const [input, setInput] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function unlock(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/admin/overview", { headers: { "x-admin-token": input }, cache: "no-store" });
      const body = await res.json();
      if (body.code !== 0) throw new Error("令牌错误");
      sessionStorage.setItem(TOKEN_KEY, input);
      onUnlock(input);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-gate">
      <form className="adm-gate-card" onSubmit={unlock}>
        <div className="adm-eyebrow">SOLFIT 商家后台</div>
        <h1>商家登录</h1>
        <p className="adm-muted" style={{ fontSize: 12, marginBottom: 18 }}>
          输入管理令牌进入完整版操作台（总后台可签发员工专属令牌）
        </p>
        <label htmlFor="adm-token">管理令牌</label>
        <input id="adm-token" type="password" value={input} onChange={(e) => setInput(e.target.value)} required autoFocus />
        {err && <p style={{ color: "#c0392b", fontSize: 12, margin: "8px 0 0" }}>{err}</p>}
        <button className="adm-btn adm-btn-primary" style={{ width: "100%", marginTop: 16, height: 40 }} type="submit" disabled={busy || !input}>
          {busy ? "验证中…" : "进入后台"}
        </button>
        <p className="adm-muted" style={{ fontSize: 11, marginTop: 14 }}>
          骨架期默认 <code>dev-admin-token</code>（生产以 ADMIN_TOKEN 环境变量为准）
        </p>
      </form>
    </div>
  );
}

/* ===== 侧边栏 ===== */
function Sidebar() {
  const pathname = usePathname() || "";
  const { data } = useOverview(30000); // 轻量轮询：只用于侧边栏角标
  const stats = data?.stats;

  const badges = {
    "/admin/merchant/orders": stats?.toShip,
    "/admin/merchant/inventory": stats?.oosSizes,
    "/admin/merchant/products": stats?.products,
    "/admin/merchant/customers": stats?.registeredUsers,
  };

  return (
    <aside className="adm-side">
      <div className="adm-side-brand">
        <b>SOLFIT</b>
        <span>商家操作台 · 完整版</span>
      </div>
      <nav className="adm-nav">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="adm-nav-group">{g.group}</div>
            {g.items.map(([href, label]) => {
              const active = href === "/admin/merchant" ? pathname === href : pathname.startsWith(href);
              const badge = badges[href];
              return (
                <Link key={href} href={href} className={`adm-nav-item ${active ? "active" : ""}`}>
                  <span>{label}</span>
                  {badge ? <span className="adm-nav-badge">{badge}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="adm-side-foot">
        {stats ? (
          <>GMV {Math.round(stats.gmvUsd).toLocaleString()} USD · 订单 {stats.orders}</>
        ) : (
          "数据加载中…"
        )}
      </div>
    </aside>
  );
}

/* ===== 顶栏 ===== */
function Topbar({ onLock }) {
  const pathname = usePathname();
  const router = useRouter();
  const title = useMemo(() => {
    const all = NAV.flatMap((g) => g.items);
    const hit = all.find(([href]) => (href === "/admin/merchant" ? pathname === href : pathname.startsWith(href)));
    return hit ? hit[1] : "商家后台";
  }, [pathname]);

  return (
    <div className="adm-top">
      <span className="adm-title">{title}</span>
      <span className="adm-crumb">商家后台 / {title}</span>
      <div className="adm-spacer" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Badge tone="ok">运营中</Badge>
        <button className="adm-btn adm-btn-outline adm-btn-sm" onClick={() => router.refresh()}>刷新</button>
        <Link className="adm-btn adm-btn-outline adm-btn-sm" href="/" target="_blank">查看店铺</Link>
        <button className="adm-btn adm-btn-danger adm-btn-sm" onClick={onLock}>锁定</button>
      </div>
    </div>
  );
}
