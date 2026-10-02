/**
 * components/admin/PromosPage — 优惠码管理（营销模块）
 * 创建（百分比/固定金额/门槛/次数上限）+ 启用停用 + 使用情况对账（订单落码可查）。
 */
"use client";

import { useState } from "react";
import { useAdmin, useOverview, act, Card, Badge, Empty, usd } from "@/components/admin/ui";

export default function PromosPage() {
  const { token } = useAdmin();
  const { data: ov, refresh } = useOverview();
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const promos = ov?.promos || [];

  async function create(e) {
    e.preventDefault();
    const f = e.target.elements;
    setBusy("promo-save");
    setMsg(null);
    try {
      await act(token, "/api/admin/promos", {
        action: "create",
        code: f.code.value,
        type: f.type.value,
        value: Number(f.value.value),
        minSpend: Number(f.minSpend.value) || 0,
        maxUses: Number(f.maxUses.value) || 0,
      });
      setMsg(`优惠码 ${String(f.code.value).toUpperCase()} 已创建`);
      e.target.reset();
      await refresh();
    } catch (e2) {
      setMsg(e2.message);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(p) {
    setBusy(`promo-${p.code}`);
    setMsg(null);
    try {
      await act(token, "/api/admin/promos", { action: p.active ? "deactivate" : "activate", code: p.code });
      setMsg(`${p.code} ${p.active ? "已停用" : "已启用"}`);
      await refresh();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!ov) return <Card title="优惠码"><Empty>加载中…</Empty></Card>;

  return (
    <>
      <Card title="创建优惠码" small="结算页验签计价，订单落码可对账">
        <form onSubmit={create}>
          <div className="adm-form-grid">
            <div><label>优惠码 *</label><input name="code" placeholder="WELCOME10" required /></div>
            <div><label>类型 *</label>
              <select name="type" defaultValue="percent">
                <option value="percent">百分比 (%)</option>
                <option value="fixed">固定金额 ($)</option>
              </select>
            </div>
            <div><label>面额 *</label><input name="value" type="number" step="0.01" min="0.01" placeholder="10" required /></div>
            <div><label>最低消费 ($)</label><input name="minSpend" type="number" step="0.01" min="0" placeholder="0" /></div>
            <div><label>次数上限（0=不限）</label><input name="maxUses" type="number" min="0" placeholder="0" /></div>
            <div style={{ display: "flex", alignItems: "end" }}>
              <button className="adm-btn adm-btn-primary" type="submit" disabled={busy === "promo-save"}>
                {busy === "promo-save" ? "创建中…" : "创建优惠码"}
              </button>
            </div>
          </div>
        </form>
      </Card>

      {msg && <p style={{ color: "#1e7a41", fontSize: 12, margin: "0 0 12px" }}>✓ {msg}</p>}

      <Card title={`优惠码列表（${promos.length}）`}>
        {promos.length ? (
          <table className="adm-table">
            <thead><tr><th>优惠码</th><th>类型/面额</th><th>门槛</th><th>已用/上限</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.code}>
                  <td style={{ fontWeight: 800, letterSpacing: "0.04em" }}>{p.code}{p.label ? <div className="adm-muted" style={{ fontSize: 11, fontWeight: 400 }}>{p.label}</div> : null}</td>
                  <td>{p.type === "percent" ? `${p.value}%` : usd(p.value)}</td>
                  <td className="adm-muted">{p.minSpend ? usd(p.minSpend) : "—"}</td>
                  <td>{p.usedCount}{p.maxUses ? ` / ${p.maxUses}` : "（不限）"}</td>
                  <td><Badge tone={p.active ? "ok" : "muted"}>{p.active ? "启用中" : "已停用"}</Badge></td>
                  <td>
                    <button
                      className={`adm-btn adm-btn-sm ${p.active ? "adm-btn-outline" : "adm-btn-primary"}`}
                      disabled={busy === `promo-${p.code}`}
                      onClick={() => toggle(p)}
                    >
                      {busy === `promo-${p.code}` ? "…" : p.active ? "停用" : "启用"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>暂无优惠码 —— 上方创建一个（如 WELCOME10 → 10% 折扣）</Empty>
        )}
      </Card>
    </>
  );
}
