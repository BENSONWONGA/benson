/**
 * components/admin/OrdersPage — 订单管理（完整版）
 * 状态筛选 + 搜索 + 详情弹窗（行项目/地址/金额拆解/物流）+ 一键发货（可填单号）。
 */
"use client";

import { useMemo, useState } from "react";
import { useAdmin, useOverview, act, Card, Badge, Empty, Pills, Modal, fmtTime, usd, ORDER_STATUS } from "@/components/admin/ui";

export default function OrdersPage() {
  const { token } = useAdmin();
  const { data: ov, refresh } = useOverview(15000);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null); // 完整订单对象
  const [detailBusy, setDetailBusy] = useState(false);
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const orders = ov?.orders || [];

  const counts = useMemo(() => {
    const c = { all: orders.length, paid: 0, shipped: 0, aftersales: 0, pending: 0, failed: 0 };
    for (const o of orders) {
      if (o.status === "paid") c.paid++;
      else if (o.status === "shipped") c.shipped++;
      else if (o.status === "exchanged" || o.status === "returned") c.aftersales++;
      else if (o.status === "pending_payment") c.pending++;
      else if (o.status === "payment_failed") c.failed++;
    }
    return c;
  }, [orders]);

  const list = useMemo(() => {
    let l = orders;
    if (filter === "paid") l = l.filter((o) => o.status === "paid");
    else if (filter === "shipped") l = l.filter((o) => o.status === "shipped");
    else if (filter === "aftersales") l = l.filter((o) => o.status === "exchanged" || o.status === "returned");
    else if (filter === "pending") l = l.filter((o) => o.status === "pending_payment" || o.status === "payment_failed");
    const kw = q.trim().toLowerCase();
    if (kw) l = l.filter((o) => o.id.toLowerCase().includes(kw) || (o.email || "").toLowerCase().includes(kw) || (o.name || "").toLowerCase().includes(kw));
    return l;
  }, [orders, filter, q]);

  async function openDetail(id) {
    setDetailBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/orders/${id}`, { headers: { "x-admin-token": token }, cache: "no-store" });
      const body = await res.json();
      if (body.code !== 0) throw new Error(body.message);
      setDetail(body.data.order);
      setTracking(body.data.order.tracking || "");
    } catch (e) {
      setMsg(e.message);
    } finally {
      setDetailBusy(false);
    }
  }

  async function ship(orderId, trackingNo) {
    setBusy(`ship-${orderId}`);
    setMsg(null);
    try {
      await act(token, "/api/admin/orders", { action: "mark_shipped", orderId, tracking: trackingNo || undefined });
      setMsg(`${orderId} 已标记发货`);
      setDetail(null);
      await refresh();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!ov) return <Card title="订单管理"><Empty>加载中…</Empty></Card>;

  return (
    <>
      <Card>
        <div className="adm-row" style={{ justifyContent: "space-between" }}>
          <Pills
            value={filter}
            onChange={setFilter}
            items={[
              ["all", "全部", counts.all],
              ["paid", "待发货", counts.paid],
              ["shipped", "已发货", counts.shipped],
              ["aftersales", "售后", counts.aftersales],
              ["pending", "待支付/失败", counts.pending],
            ]}
          />
          <input
            style={{ width: 220 }}
            placeholder="搜索订单号 / 买家 / 邮箱"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </Card>

      {msg && <p style={{ color: "#1e7a41", fontSize: 12, margin: "0 0 12px" }}>✓ {msg}</p>}

      <Card title={`订单列表（${list.length}）`} small="待发货行可填单号后发货，或直接点发货">
        {list.length ? (
          <table className="adm-table">
            <thead>
              <tr><th>订单号</th><th>下单时间</th><th>买家</th><th>地区</th><th>商品</th><th>金额</th><th>状态</th><th>物流单号</th><th>操作</th></tr>
            </thead>
            <tbody>
              {list.map((o) => {
                const meta = ORDER_STATUS[o.status] || { zh: o.status, tone: "muted" };
                return (
                  <tr key={o.id}>
                    <td className="adm-mono" style={{ fontWeight: 700 }}>{o.id.slice(0, 14)}{o.hasAccount ? <span title="注册用户"> ●</span> : null}</td>
                    <td className="adm-muted" style={{ fontSize: 12 }}>{fmtTime(o.createdAt)}</td>
                    <td>{o.name || "—"}<div className="adm-muted" style={{ fontSize: 11 }}>{o.email}</div></td>
                    <td className="adm-muted">{o.country} · {o.region}</td>
                    <td title={o.items.map((i) => `${i.name} EU${i.size} ×${i.qty}`).join("\n")}>{o.itemCount} 件</td>
                    <td style={{ fontWeight: 700 }}>{usd(o.total)}</td>
                    <td><Badge tone={meta.tone}>{meta.zh}</Badge></td>
                    <td className="adm-mono" style={{ fontSize: 11 }}>{o.tracking ? o.tracking.slice(0, 18) : "—"}</td>
                    <td>
                      <div className="adm-row" style={{ gap: 6 }}>
                        <button className="adm-btn adm-btn-outline adm-btn-sm" onClick={() => openDetail(o.id)}>详情</button>
                        {o.status === "paid" && (
                          <button className="adm-btn adm-btn-primary adm-btn-sm" disabled={busy === `ship-${o.id}`} onClick={() => ship(o.id)}>
                            {busy === `ship-${o.id}` ? "…" : "发货"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <Empty>当前筛选无订单</Empty>
        )}
      </Card>

      {/* ===== 订单详情弹窗 ===== */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `订单详情 · ${detail.id.slice(0, 14)}` : ""} width={720}>
        {detailBusy && <Empty>加载中…</Empty>}
        {detail && !detailBusy && (
          <>
            {(() => {
              const meta = ORDER_STATUS[detail.status] || { zh: detail.status, tone: "muted" };
              return (
                <div className="adm-row" style={{ marginBottom: 14 }}>
                  <Badge tone={meta.tone}>{meta.zh}</Badge>
                  <span className="adm-muted" style={{ fontSize: 12 }}>下单 {fmtTime(detail.createdAt)}</span>
                  {detail.shippedAt && <span className="adm-muted" style={{ fontSize: 12 }}>发货 {fmtTime(detail.shippedAt)}</span>}
                  <span className="adm-muted" style={{ fontSize: 12 }}>支付方式 {detail.paymentMethod || "—"}</span>
                  {detail.promoCode && <Badge tone="info">优惠码 {detail.promoCode}</Badge>}
                </div>
              );
            })()}

            <div className="adm-grid-2" style={{ gap: 14 }}>
              <div>
                <b style={{ fontSize: 12 }}>收货信息</b>
                <div className="adm-muted" style={{ marginTop: 6, lineHeight: 1.9, fontSize: 12 }}>
                  {(detail.address?.name || "—")} · {detail.email}
                  <br />
                  {detail.address?.street || detail.address?.line1 || "—"}，{detail.address?.city || "—"}，{detail.address?.zip || "—"}
                  <br />
                  {detail.address?.country || "—"}（{detail.region}）
                </div>
              </div>
              <div>
                <b style={{ fontSize: 12 }}>金额拆解</b>
                <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.9 }}>
                  <div className="adm-row"><span className="adm-muted">小计</span><span className="adm-spacer">{usd(detail.totals?.subtotal)}</span></div>
                  {detail.totals?.promoDiscount ? <div className="adm-row"><span className="adm-muted">优惠</span><span className="adm-spacer" style={{ color: "#b3362a" }}>-{usd(detail.totals.promoDiscount)}</span></div> : null}
                  <div className="adm-row"><span className="adm-muted">运费</span><span className="adm-spacer">{usd(detail.totals?.shipping)}</span></div>
                  <div className="adm-row"><span className="adm-muted">税费{detail.taxQuote?.type === "inclusive" ? "（含税价）" : ""}</span><span className="adm-spacer">{usd(detail.totals?.tax)}</span></div>
                  <div className="adm-row" style={{ fontWeight: 800, fontSize: 14 }}><span>合计</span><span className="adm-spacer">{usd(detail.totals?.total)}</span></div>
                </div>
              </div>
            </div>

            <table className="adm-table" style={{ margin: "16px 0" }}>
              <thead><tr><th>商品</th><th>尺码/楦宽</th><th>数量</th><th>单价</th><th>小计</th></tr></thead>
              <tbody>
                {(detail.items || []).map((i, idx) => (
                  <tr key={idx}>
                    <td>{i.name}</td>
                    <td>EU {i.size}{i.width ? ` / ${i.width}` : ""}</td>
                    <td>×{i.qty}</td>
                    <td>{usd(i.unitPrice)}</td>
                    <td style={{ fontWeight: 700 }}>{usd(i.lineTotal ?? (i.unitPrice || 0) * (i.qty || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {detail.status === "paid" ? (
              <div className="adm-row">
                <input style={{ width: 260 }} placeholder="物流单号（可留空用预置单号）" value={tracking} onChange={(e) => setTracking(e.target.value)} />
                <button
                  className="adm-btn adm-btn-primary"
                  disabled={busy === `ship-${detail.id}`}
                  onClick={() => ship(detail.id, tracking)}
                >
                  {busy === `ship-${detail.id}` ? "发货中…" : "确认发货"}
                </button>
              </div>
            ) : (
              detail.tracking && <p className="adm-mono" style={{ fontSize: 12 }}>物流单号：{detail.tracking}</p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
