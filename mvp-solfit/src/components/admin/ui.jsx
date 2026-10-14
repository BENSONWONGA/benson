/**
 * components/admin/ui.jsx — 后台完整版共享库（客户端）
 * 提供：令牌上下文 useAdmin / 一站式数据钩子 useOverview / 操作请求 act /
 *       原子组件（Card·Kpi·Badge·Modal·Empty·Pills）/ 状态字典与格式化工具。
 * 页面组件只管业务编排，样式全部走 admin.css 的 .adm-* 命名空间。
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export const TOKEN_KEY = "solfit_admin_token";

const AdminCtx = createContext(null);
export const AdminProvider = AdminCtx.Provider;
export const useAdmin = () => useContext(AdminCtx);

/* ===== 格式化 ===== */
export const fmtTime = (iso) => (iso || "").slice(0, 16).replace("T", " ");
export const fmtDate = (iso) => (iso || "").slice(0, 10);
export const usd = (n) => "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

/* ===== 状态字典 ===== */
export const ORDER_STATUS = {
  paid: { zh: "待发货", tone: "warn" },
  shipped: { zh: "已发货", tone: "ok" },
  exchanged: { zh: "已换货", tone: "err" },
  returned: { zh: "已退货", tone: "err" },
  pending_payment: { zh: "待支付", tone: "muted" },
  payment_failed: { zh: "支付失败", tone: "err" },
};
export const TIER_TONE = { Gold: "warn", Silver: "info", Member: "muted" };
export const FIT_ZH = { too_small: "偏小", too_large: "偏大", true_to_size: "正码" };

/* ===== 一站式数据（/api/admin/overview 轮询）===== */
export function useOverview(pollMs = 0) {
  const { token } = useAdmin();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/overview", { headers: { "x-admin-token": token }, cache: "no-store" });
      const body = await res.json();
      if (body.code !== 0) throw new Error(body.message || "BAD_RESPONSE");
      setData(body.data);
      setErr(null);
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
    }
  }, [token]);

  useEffect(() => {
    load();
    if (pollMs) {
      const t = setInterval(load, pollMs);
      return () => clearInterval(t);
    }
  }, [load, pollMs]);

  return { data, err, loading: !data && !err, refresh: load };
}

/* ===== 写操作请求（统一 code!==0 抛错 + 成功后可刷新）===== */
export async function act(token, url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-token": token },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (body.code !== 0) throw new Error(body.message || "操作失败");
  return body.data;
}

/* ===== 原子组件 ===== */
export const Card = ({ title, small, extra, children, style }) => (
  <div className="adm-card" style={style}>
    {(title || extra) && (
      <div className="adm-card-title">
        <span>{title}{small ? <small style={{ marginLeft: 8 }}>{small}</small> : null}</span>
        {extra}
      </div>
    )}
    {children}
  </div>
);

export const Kpi = ({ num, lbl, sub, tone }) => (
  <div className={`adm-kpi${tone ? ` ${tone}` : ""}`}>
    <div className="adm-kpi-num">{num}</div>
    <div className="adm-kpi-lbl">{lbl}</div>
    {sub ? <div className="adm-kpi-sub">{sub}</div> : null}
  </div>
);

export const Badge = ({ tone, children }) => <span className={`adm-badge ${tone || "muted"}`}>{children}</span>;

export const Empty = ({ children }) => <div className="adm-empty">{children || "暂无数据"}</div>;

export const Pills = ({ items, value, onChange }) => (
  <div className="adm-pills">
    {items.map(([id, label, count]) => (
      <button key={id} className={`adm-pill ${value === id ? "active" : ""}`} onClick={() => onChange(id)}>
        {label}{count !== undefined ? ` (${count})` : ""}
      </button>
    ))}
  </div>
);

export const Modal = ({ open, onClose, title, width, children }) => {
  if (!open) return null;
  return (
    <div className="adm-modal-mask" onClick={onClose}>
      <div className="adm-modal" style={width ? { maxWidth: width } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-head">
          <b>{title}</b>
          <button className="adm-btn adm-btn-outline adm-btn-sm" onClick={onClose}>关闭</button>
        </div>
        {children}
      </div>
    </div>
  );
};
