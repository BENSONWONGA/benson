/**
 * components/admin/AdminShell — 商家后台框架（客户端 · iOS 26 Liquid Glass）
 * 壁纸层（漂移色斑）+ 浮动玻璃侧栏（图标导航）+ 胶囊顶栏 + 移动端胶囊标签条。
 * 令牌进 React Context（ui.jsx useAdmin），页面组件零样板取 token。
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AdminProvider, TOKEN_KEY, useOverview, Badge } from "@/components/admin/ui";

/** 侧边栏信息架构：概览 → 销售 → 商品 → 客户与营销 → 品牌 → 数据与系统 */
const NAV = [
  { group: "概览", items: [["/admin/merchant", "仪表盘", "grid"]] },
  {
    group: "销售",
    items: [
      ["/admin/merchant/orders", "订单管理", "receipt"],
      ["/admin/merchant/reviews", "评价管理", "star"],
    ],
  },
  {
    group: "商品",
    items: [
      ["/admin/merchant/products", "商品管理", "cube"],
      ["/admin/merchant/inventory", "库存管理", "layers"],
    ],
  },
  {
    group: "客户与营销",
    items: [
      ["/admin/merchant/customers", "会员管理", "person"],
      ["/admin/merchant/promos", "优惠码", "tag"],
      ["/admin/merchant/content", "内容营销", "doc"],
    ],
  },
  { group: "品牌", items: [["/admin/merchant/branding", "品牌装修", "palette"]] },
  {
    group: "数据与系统",
    items: [
      ["/admin/merchant/analytics", "数据分析", "chart"],
      ["/admin/master", "总后台", "shield"],
      ["/admin/monitoring", "监控看板", "pulse"],
      ["/admin/baseline", "基线看板", "gauge"],
    ],
  },
];

/* ===== 线性图标（SF Symbols 气质，24 viewBox stroke）===== */
const ICONS = {
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>,
  receipt: <><path d="M7 3h10a1 1 0 0 1 1 1v16.5l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1z" /><path d="M9.5 8.5h5M9.5 12.5h5" /></>,
  star: <path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />,
  cube: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5z" /><path d="m3 13.5 9 5 9-5" /></>,
  person: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="17" cy="9.5" r="2.4" /><path d="M16 15.4c2.3.3 4.1 1.9 4.6 4.6" /></>,
  tag: <><path d="M3 11.5V4.5a1 1 0 0 1 1-1h7L21 13.5 12.5 21z" /><circle cx="7.5" cy="7.5" r="1.3" /></>,
  doc: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 12.5h6M9 16h6" /></>,
  palette: <><circle cx="12" cy="12" r="8.5" /><circle cx="9" cy="9" r="1" /><circle cx="15" cy="9" r="1" /><circle cx="9" cy="15" r="1" /><circle cx="15" cy="15" r="1" /></>,
  chart: <><path d="M4 20h16" /><rect x="5.5" y="11" width="3" height="6" rx="1" /><rect x="10.5" y="7" width="3" height="10" rx="1" /><rect x="15.5" y="13" width="3" height="4" rx="1" /></>,
  shield: <><path d="M12 3l7 3v6c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
  gauge: <><path d="M5 19a9 9 0 1 1 14 0" /><path d="m12 13 3.5-3.5" /><circle cx="12" cy="13" r="1.2" /></>,
};

function NavIcon({ name, active }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flex: "0 0 auto", opacity: active ? 1 : 0.82 }}
    >
      {ICONS[name] || ICONS.grid}
    </svg>
  );
}

/* ===== 壁纸（液态玻璃的"液体"背景，纯 CSS 动画）===== */
function Wall() {
  return (
    <div className="adm-wall" aria-hidden>
      <i className="wb-a" />
      <i className="wb-b" />
      <i className="wb-c" />
      <i className="wb-d" />
    </div>
  );
}

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
        <Wall />
        <Sidebar />
        <div className="adm-main">
          <Topbar onLock={() => { sessionStorage.removeItem(TOKEN_KEY); setToken(null); }} />
          <Tabstrip />
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
      <Wall />
      <form className="adm-gate-card" onSubmit={unlock}>
        <div className="adm-eyebrow">SOLFIT 商家后台</div>
        <h1>商家登录</h1>
        <p className="adm-muted" style={{ fontSize: 12, marginBottom: 18 }}>
          输入管理令牌进入完整版操作台（总后台可签发员工专属令牌）
        </p>
        <label htmlFor="adm-token">管理令牌</label>
        <input id="adm-token" type="password" value={input} onChange={(e) => setInput(e.target.value)} required autoFocus />
        {err && <p style={{ color: "var(--adm-err)", fontSize: 12, margin: "8px 0 0" }}>{err}</p>}
        <button className="adm-btn adm-btn-primary" style={{ width: "100%", marginTop: 18, height: 42 }} type="submit" disabled={busy || !input}>
          {busy ? "验证中…" : "进入后台"}
        </button>
        <p className="adm-muted" style={{ fontSize: 11, marginTop: 16 }}>
          骨架期默认 <code>dev-admin-token</code>（生产以 ADMIN_TOKEN 环境变量为准）
        </p>
      </form>
    </div>
  );
}

/* ===== 侧边栏（浮动玻璃面板 + 图标导航）===== */
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
        <span>商家操作台 · Liquid Glass</span>
      </div>
      <nav className="adm-nav">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="adm-nav-group">{g.group}</div>
            {g.items.map(([href, label, icon]) => {
              const active = href === "/admin/merchant" ? pathname === href : pathname.startsWith(href);
              const badge = badges[href];
              return (
                <Link key={href} href={href} className={`adm-nav-item ${active ? "active" : ""}`}>
                  <span className="adm-nav-label">
                    <NavIcon name={icon} active={active} />
                    <span>{label}</span>
                  </span>
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

/* ===== 移动端胶囊标签条（≤900px 显示，替代侧栏）===== */
function Tabstrip() {
  const pathname = usePathname() || "";
  return (
    <nav className="adm-tabstrip" aria-label="后台导航">
      {NAV.flatMap((g) => g.items).map(([href, label]) => {
        const active = href === "/admin/merchant" ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={active ? "active" : ""}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/* ===== 顶栏（浮动玻璃胶囊条）===== */
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
