/**
 * components/admin/Dashboard — 仪表盘（商家后台首页）
 * KPI 墙 + 14 日 GMV 趋势 + 状态分布 + 待办（待发货单/缺码预警/热销榜），15s 轮询。
 */
"use client";

import { useState } from "react";
import { useAdmin, useOverview, act, Card, Kpi, Badge, Empty, fmtTime, usd, ORDER_STATUS } from "@/components/admin/ui";

export default function Dashboard() {
  const { token } = useAdmin();
  const [dash, setDash] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const { data: ov, refresh } = useOverview(15000);

  // 仪表盘聚合单独拉取 + 概览刷新后联动
  async function loadDash() {
    try {
      const res = await fetch("/api/admin/dashboard", { headers: { "x-admin-token": token }, cache: "no-store" });
      const body = await res.json();
      if (body.code !== 0) throw new Error(body.message);
      setDash(body.data);
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }
  if (!dash && !err) loadDash(); // 首次挂载（Promise 状态由 setState 承接）

  async function ship(orderId) {
    setBusy(`ship-${orderId}`);
    try {
      await act(token, "/api/admin/orders", { action: "mark_shipped", orderId });
      await Promise.all([loadDash(), refresh()]);
    } finally {
      setBusy(null);
    }
  }

  if (err) return <Card title="仪表盘"><Empty>加载失败：{err}</Empty></Card>;
  if (!dash || !ov) return <Card title="仪表盘"><Empty>加载中…</Empty></Card>;

  const k = dash.kpis;
  const maxGmv = Math.max(...dash.trend.map((t) => t.gmv), 1);
  const maxCount = Math.max(...dash.statusBreakdown.map((s) => s.count), 1);

  return (
    <>
      {/* ===== KPI 墙 ===== */}
      <div className="adm-kpis">
        <Kpi num={usd(k.gmvUsd)} lbl="成交额 GMV (USD)" sub={`毛利 ${usd(k.marginUsd)} · ${k.marginPct}%`} />
        <Kpi num={k.orders} lbl="订单总数" sub={`已发货 ${k.shipped}`} />
        <Kpi num={k.toShip} lbl="待发货" tone="warn" sub="点击下方订单直接发货" />
        <Kpi num={k.afterSales} lbl="售后（换货/退货）" tone={k.afterSales ? "err" : undefined} />
        <Kpi num={k.registeredUsers} lbl="注册会员" sub="等级按累计实付派生" />
        <Kpi num={k.products} lbl="在售商品" sub={k.unlisted ? `${k.unlisted} 个已下架` : "全部在售"} />
        <Kpi num={k.oosSizes} lbl="缺码尺码" tone={k.oosSizes ? "err" : "ok"} sub="库存管理可一键补齐" />
        <Kpi num={usd(k.cogsUsd)} lbl="商品成本 COGS" sub="UE 模型口径（缺成本按 40% 估）" />
      </div>

      {/* ===== 趋势 + 状态分布 ===== */}
      <div className="adm-grid-icons">
        <Card title="近 14 日成交趋势" small={`峰值 ${usd(maxGmv)}`}>
          {dash.trend.some((t) => t.gmv > 0) ? (
            <div className="adm-bars-wrap">
              <div className="adm-bars">
                {dash.trend.map((t) => (
                  <div
                    key={t.day}
                    className="adm-bar"
                    style={{ height: `${Math.max(2, (t.gmv / maxGmv) * 100)}%` }}
                    title={`${t.day}：GMV ${usd(t.gmv)} · ${t.orders} 单`}
                  >
                    <em>{t.label}</em>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty>近 14 日暂无成交 —— 前台下一单即可看到趋势</Empty>
          )}
        </Card>

        <Card title="订单状态分布" small={`共 ${k.orders} 单`}>
          {dash.statusBreakdown.length ? (
            dash.statusBreakdown.map((s) => {
              const meta = ORDER_STATUS[s.status] || { zh: s.status, tone: "muted" };
              return (
                <div key={s.status} style={{ marginBottom: 10 }}>
                  <div className="adm-row" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{meta.zh}</span>
                    <span className="adm-muted" style={{ fontSize: 12 }}>{s.count} 单</span>
                  </div>
                  <div className="adm-hbar"><div style={{ width: `${(s.count / maxCount) * 100}%` }} /></div>
                </div>
              );
            })
          ) : (
            <Empty>暂无订单</Empty>
          )}
        </Card>
      </div>

      {/* ===== 待办区 ===== */}
      <div className="adm-grid-icons">
        <Card title="最新订单" small="待发货可直接发货（paid → shipped）"
          extra={<a className="adm-btn adm-btn-outline adm-btn-sm" href="/admin/merchant/orders">全部订单</a>}>
          {dash.recentOrders.length ? (
            <table className="adm-table">
              <thead><tr><th>订单号</th><th>买家</th><th>金额</th><th>状态</th><th></th></tr></thead>
              <tbody>
                {dash.recentOrders.map((o) => {
                  const meta = ORDER_STATUS[o.status] || { zh: o.status, tone: "muted" };
                  return (
                    <tr key={o.id}>
                      <td className="adm-mono">{o.id.slice(0, 12)}</td>
                      <td>{o.name || "—"}<div className="adm-muted" style={{ fontSize: 11 }}>{o.country}</div></td>
                      <td>{usd(o.total)}</td>
                      <td><Badge tone={meta.tone}>{meta.zh}</Badge></td>
                      <td>
                        {o.status === "paid" && (
                          <button className="adm-btn adm-btn-primary adm-btn-sm" disabled={busy === `ship-${o.id}`} onClick={() => ship(o.id)}>
                            {busy === `ship-${o.id}` ? "…" : "发货"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <Empty>暂无订单 —— 前台下一单，或 POST /api/debug/seed-order 造一单</Empty>
          )}
        </Card>

        <Card title="缺码预警" small="按缺码数排序"
          extra={<a className="adm-btn adm-btn-outline adm-btn-sm" href="/admin/merchant/inventory">去补货</a>}>
          {dash.lowStock.length ? (
            <table className="adm-table">
              <thead><tr><th>商品</th><th>缺码</th><th>总库存</th></tr></thead>
              <tbody>
                {dash.lowStock.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td><Badge tone="err">{p.oos} 码</Badge></td>
                    <td>{p.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>库存健康，无缺码</Empty>
          )}
        </Card>

        <Card title="热销商品" small="按已成交销量">
          {dash.topProducts.length ? (
            <table className="adm-table">
              <thead><tr><th>商品</th><th>销量</th><th>营收</th></tr></thead>
              <tbody>
                {dash.topProducts.map((p) => (
                  <tr key={p.id}>
                    <td><a href={`/product/${p.id}`} target="_blank">{p.name}</a></td>
                    <td>{p.units} 双</td>
                    <td>{usd(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>暂无成交数据</Empty>
          )}
        </Card>
      </div>

      <p className="adm-muted" style={{ fontSize: 11, marginTop: 4 }}>
        数据 15 秒自动刷新 · 最后更新 {fmtTime(dash.generatedAt)} · GMV 口径：已成交单（不含待支付/支付失败）
      </p>
    </>
  );
}
