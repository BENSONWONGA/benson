/**
 * components/admin/ReviewsPage — 评价管理（完整版）
 * 全量已购验证 UGC 审核：评分/合脚度速览 + 删除违规（商品评分聚合即刻重算）。
 */
"use client";

import { useMemo, useState } from "react";
import { useAdmin, useOverview, act, Card, Badge, Empty, Pills, fmtTime, FIT_ZH } from "@/components/admin/ui";

export default function ReviewsPage() {
  const { token } = useAdmin();
  const { data: ov, refresh } = useOverview();
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const reviews = ov?.reviews || [];
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  const list = useMemo(() => {
    if (filter === "good") return reviews.filter((r) => r.rating >= 4);
    if (filter === "bad") return reviews.filter((r) => r.rating <= 2);
    return reviews;
  }, [reviews, filter]);

  async function remove(r) {
    if (!confirm(`确认删除这条评价？\n\n${r.productName} · ${r.rating} 星\n${r.title || ""}\n${r.body.slice(0, 80)}…\n\n删除后商品评分聚合即刻重算`)) return;
    setBusy(`rev-${r.id}`);
    setMsg(null);
    try {
      await act(token, "/api/admin/reviews", { action: "remove", reviewId: r.id });
      setMsg(`评价已删除（${r.productName} 评分聚合已重算）`);
      await refresh();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!ov) return <Card title="评价管理"><Empty>加载中…</Empty></Card>;

  return (
    <>
      <div className="adm-kpis">
        <div className="adm-kpi"><div className="adm-kpi-num">{reviews.length}</div><div className="adm-kpi-lbl">评价总数（全部已购验证）</div></div>
        <div className="adm-kpi"><div className="adm-kpi-num">{reviews.length ? avg.toFixed(1) : "—"}</div><div className="adm-kpi-lbl">平均评分</div></div>
        <div className="adm-kpi"><div className="adm-kpi-num">{reviews.filter((r) => r.rating <= 2).length}</div><div className="adm-kpi-lbl">低分差评（≤2 星）</div></div>
        <div className="adm-kpi"><div className="adm-kpi-num">{reviews.filter((r) => r.fit && r.fit !== "true_to_size").length}</div><div className="adm-kpi-lbl">反馈偏码（训练回流样本）</div></div>
      </div>

      <Card>
        <Pills
          value={filter}
          onChange={setFilter}
          items={[
            ["all", "全部", reviews.length],
            ["good", "好评（4-5 星）", reviews.filter((r) => r.rating >= 4).length],
            ["bad", "差评（≤2 星）", reviews.filter((r) => r.rating <= 2).length],
          ]}
        />
      </Card>

      {msg && <p style={{ color: "#1e7a41", fontSize: 12, margin: "0 0 12px" }}>✓ {msg}</p>}

      <Card title={`评价列表（${list.length}）`} small="删除用于违规内容审核，操作全程审计可查">
        {list.length ? (
          <table className="adm-table">
            <thead><tr><th>内容</th><th>商品</th><th>评分</th><th>合脚度</th><th>作者</th><th>时间</th><th>操作</th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td style={{ maxWidth: 320 }}>
                    {r.title ? <b>{r.title}</b> : <span className="adm-muted">（无标题）</span>}
                    <div className="adm-muted" style={{ fontSize: 12, marginTop: 2 }}>{r.body.length > 100 ? r.body.slice(0, 100) + "…" : r.body}</div>
                  </td>
                  <td><a href={`/product/${r.productId}`} target="_blank">{r.productName}</a></td>
                  <td style={{ color: r.rating >= 4 ? "#1e7a41" : r.rating <= 2 ? "#b3362a" : "#b06e00", fontWeight: 800 }}>
                    {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                  </td>
                  <td><Badge tone={r.fit === "true_to_size" ? "ok" : r.fit ? "warn" : "muted"}>{FIT_ZH[r.fit] || "—"}</Badge></td>
                  <td className="adm-muted">{r.author}{r.verified && <span title="已购验证" style={{ color: "#1e7a41" }}> ●</span>}</td>
                  <td className="adm-muted" style={{ fontSize: 11 }}>{fmtTime(r.createdAt)}</td>
                  <td>
                    <button className="adm-btn adm-btn-danger adm-btn-sm" disabled={busy === `rev-${r.id}`} onClick={() => remove(r)}>
                      {busy === `rev-${r.id}` ? "…" : "删除"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>暂无评价 —— 前台买一单后即可评价（评价表单在商品页底部）</Empty>
        )}
      </Card>
    </>
  );
}
