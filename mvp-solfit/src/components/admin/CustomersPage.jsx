/**
 * components/admin/CustomersPage — 会员管理（完整版 CRM）
 * 等级名册（Member/Silver/Gold 按累计实付派生）+ 积分调整 + 会员详情（订单历史联动）。
 */
"use client";

import { useState } from "react";
import { useAdmin, useOverview, act, Card, Badge, Empty, Modal, fmtTime, fmtDate, usd, ORDER_STATUS, TIER_TONE } from "@/components/admin/ui";

export default function CustomersPage() {
  const { token } = useAdmin();
  const { data: ov, refresh } = useOverview();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [detail, setDetail] = useState(null); // customer 对象

  const customers = ov?.customers || [];
  const orders = ov?.orders || [];

  const list = customers.filter((c) => {
    const kw = q.trim().toLowerCase();
    if (!kw) return true;
    return (c.name || "").toLowerCase().includes(kw) || (c.email || "").toLowerCase().includes(kw);
  });

  async function adjust(c, delta) {
    if (!delta) return;
    setBusy(`pts-${c.id}`);
    setMsg(null);
    try {
      await act(token, "/api/admin/customers", { action: "adjust_points", userId: c.id, delta, reason: "console" });
      setMsg(`${c.email} 积分 ${delta > 0 ? "+" : ""}${delta} → ${Math.max(0, c.points + delta)}`);
      await refresh();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!ov) return <Card title="会员管理"><Empty>加载中…</Empty></Card>;

  const tiers = {
    Gold: customers.filter((c) => c.tier === "Gold").length,
    Silver: customers.filter((c) => c.tier === "Silver").length,
    Member: customers.filter((c) => c.tier === "Member").length,
  };

  return (
    <>
      <div className="adm-kpis">
        <div className="adm-kpi"><div className="adm-kpi-num">{customers.length}</div><div className="adm-kpi-lbl">注册会员</div></div>
        <div className="adm-kpi"><div className="adm-kpi-num">{tiers.Gold}</div><div className="adm-kpi-lbl">Gold（$800+ · 2× 积分）</div></div>
        <div className="adm-kpi"><div className="adm-kpi-num">{tiers.Silver}</div><div className="adm-kpi-lbl">Silver（$300+ · 1.5× 积分）</div></div>
        <div className="adm-kpi"><div className="adm-kpi-num">{usd(customers.reduce((s, c) => s + c.lifetimeSpend, 0))}</div><div className="adm-kpi-lbl">累计实付（全站）</div></div>
      </div>

      <Card>
        <div className="adm-row" style={{ justifyContent: "space-between" }}>
          <span className="adm-muted" style={{ fontSize: 12 }}>
            等级按累计实付自动派生（不可手改）；手动调积分用于客诉补偿/活动奖励 —— 全程审计可查
          </span>
          <input style={{ width: 240 }} placeholder="搜索姓名 / 邮箱" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>

      {msg && <p style={{ color: "#1e7a41", fontSize: 12, margin: "0 0 12px" }}>✓ {msg}</p>}

      <Card title={`会员名册（${list.length}）`}>
        {list.length ? (
          <table className="adm-table">
            <thead><tr><th>会员</th><th>等级</th><th>积分</th><th>累计实付</th><th>订单</th><th>注册</th><th>积分调整</th><th></th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name || "—"}</b><div className="adm-muted" style={{ fontSize: 11 }}>{c.email}</div></td>
                  <td><Badge tone={TIER_TONE[c.tier] || "muted"}>{c.tier}{c.multiplier > 1 ? ` · ${c.multiplier}×` : ""}</Badge></td>
                  <td style={{ fontWeight: 800 }}>{c.points.toLocaleString()}</td>
                  <td>{usd(c.lifetimeSpend)}</td>
                  <td>{c.orders}{c.lastOrderAt ? <div className="adm-muted" style={{ fontSize: 11 }}>最近 {fmtDate(c.lastOrderAt)}</div> : null}</td>
                  <td className="adm-muted" style={{ fontSize: 11 }}>{fmtDate(c.joinedAt)}</td>
                  <td>
                    <form
                      style={{ display: "flex", gap: 6 }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        adjust(c, Number(e.target.elements.delta.value));
                        e.target.elements.delta.value = "";
                      }}
                    >
                      <input name="delta" type="number" placeholder="±500" style={{ width: 80 }} disabled={busy === `pts-${c.id}`} />
                      <button className="adm-btn adm-btn-outline adm-btn-sm" type="submit" disabled={busy === `pts-${c.id}`}>
                        {busy === `pts-${c.id}` ? "…" : "调整"}
                      </button>
                    </form>
                  </td>
                  <td>
                    <button className="adm-btn adm-btn-outline adm-btn-sm" onClick={() => setDetail(c)}>详情</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>暂无注册会员 —— 前台注册一个账户试试（积分赚取从下单/评价开始）</Empty>
        )}
      </Card>

      {/* ===== 会员详情 ===== */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `会员详情 · ${detail.name || detail.email}` : ""}
        width={720}
      >
        {detail && (() => {
          const myOrders = orders.filter((o) => o.email === detail.email);
          return (
            <>
              <div className="adm-kpis" style={{ margin: "0 0 16px" }}>
                <div className="adm-kpi"><div className="adm-kpi-num">{detail.points.toLocaleString()}</div><div className="adm-kpi-lbl">积分（100 分 = $1 结算抵扣）</div></div>
                <div className="adm-kpi"><div className="adm-kpi-num">{usd(detail.lifetimeSpend)}</div><div className="adm-kpi-lbl">累计实付</div></div>
                <div className="adm-kpi"><div className="adm-kpi-num">{myOrders.length}</div><div className="adm-kpi-lbl">订单数</div></div>
                <div className="adm-kpi"><div className="adm-kpi-num" style={{ fontSize: 16 }}>{detail.tier}</div><div className="adm-kpi-lbl">当前等级（{detail.multiplier}× 积分）</div></div>
              </div>
              <b style={{ fontSize: 12 }}>订单历史（{myOrders.length}）</b>
              {myOrders.length ? (
                <table className="adm-table" style={{ marginTop: 10 }}>
                  <thead><tr><th>订单号</th><th>时间</th><th>金额</th><th>状态</th></tr></thead>
                  <tbody>
                    {myOrders.map((o) => {
                      const meta = ORDER_STATUS[o.status] || { zh: o.status, tone: "muted" };
                      return (
                        <tr key={o.id}>
                          <td className="adm-mono">{o.id.slice(0, 14)}</td>
                          <td className="adm-muted" style={{ fontSize: 12 }}>{fmtTime(o.createdAt)}</td>
                          <td>{usd(o.total)}</td>
                          <td><Badge tone={meta.tone}>{meta.zh}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <Empty>该会员暂无订单</Empty>
              )}
              <p className="adm-muted" style={{ fontSize: 11, marginTop: 12 }}>
                注册于 {fmtDate(detail.joinedAt)} · GDPR 合规：会员可自行在 /privacy 导出或抹除个人数据
              </p>
            </>
          );
        })()}
      </Modal>
    </>
  );
}
