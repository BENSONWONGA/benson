/**
 * components/admin/InventoryPage — 库存管理（完整版）
 * 商品 × 尺码矩阵（0 红 / <3 黄）+ 单码补货弹窗 + 一键补齐低码。
 * 补货复用 inventory 域锁语义（与下单扣减互斥）。
 */
"use client";

import { useState } from "react";
import { useAdmin, useOverview, act, Card, Badge, Empty, Modal, usd } from "@/components/admin/ui";

export default function InventoryPage() {
  const { token } = useAdmin();
  const { data: ov, refresh } = useOverview(15000);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [restock, setRestock] = useState(null); // {product, size}

  const inventory = ov?.inventory || [];
  const oosTotal = inventory.reduce((s, p) => s + p.sizes.filter((x) => x.stock === 0).length, 0);
  const lowTotal = inventory.reduce((s, p) => s + p.sizes.filter((x) => x.stock > 0 && x.stock < 3).length, 0);

  async function restockLow(p) {
    setBusy(`low-${p.id}`);
    setMsg(null);
    try {
      const r = await act(token, "/api/admin/inventory", { action: "restock_low", productId: p.id });
      setMsg(`${p.name}：${r.lines} 个低库存尺码已补到 6（共 +${r.qty} 双）`);
      await refresh();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function restockOne(productId, size, qty) {
    setBusy("one");
    setMsg(null);
    try {
      const r = await act(token, "/api/admin/inventory", { action: "restock", items: [{ productId, size, qty }] });
      setMsg(`EU ${size} 已补 +${r.qty} 双`);
      setRestock(null);
      await refresh();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!ov) return <Card title="库存管理"><Empty>加载中…</Empty></Card>;

  return (
    <>
      <div className="adm-kpis">
        <div className="adm-kpi"><div className="adm-kpi-num">{inventory.length}</div><div className="adm-kpi-lbl">在库商品</div></div>
        <div className="adm-kpi"><div className="adm-kpi-num" style={{ color: oosTotal ? "#b3362a" : "#1e7a41" }}>{oosTotal}</div><div className="adm-kpi-lbl">缺货尺码（0）</div></div>
        <div className="adm-kpi"><div className="adm-kpi-num" style={{ color: lowTotal ? "#b06e00" : "#1e7a41" }}>{lowTotal}</div><div className="adm-kpi-lbl">低库存尺码（&lt;3）</div></div>
        <div className="adm-kpi"><div className="adm-kpi-num">{inventory.reduce((s, p) => s + p.sizes.reduce((a, b) => a + b.stock, 0), 0)}</div><div className="adm-kpi-lbl">总库存（双）</div></div>
      </div>

      {msg && <p style={{ color: "#1e7a41", fontSize: 12, margin: "0 0 12px" }}>✓ {msg}</p>}

      {inventory.map((p) => {
        const lowCount = p.sizes.filter((s) => s.stock < 3).length;
        return (
          <Card key={p.id} title={p.name} small={`${p.category} · ${usd(p.price)} · ${p.listed ? "在售" : "已下架"}`}
            extra={
              <div className="adm-row">
                {lowCount > 0 && <Badge tone="warn">{lowCount} 个尺码需补</Badge>}
                <button
                  className="adm-btn adm-btn-primary adm-btn-sm"
                  disabled={busy === `low-${p.id}` || !lowCount}
                  onClick={() => restockLow(p)}
                >
                  {busy === `low-${p.id}` ? "补货中…" : lowCount ? "一键补齐低库存（到 6）" : "库存正常"}
                </button>
              </div>
            }
          >
            <div className="adm-row">
              {p.sizes.map((s) => (
                <button
                  key={s.size}
                  className={`adm-size-chip ${s.stock === 0 ? "oos" : s.stock < 3 ? "low" : ""}`}
                  title="点击补货"
                  onClick={() => setRestock({ product: p, size: s.size, stock: s.stock })}
                  style={{ cursor: "pointer" }}
                >
                  EU {s.size} · {s.stock}
                </button>
              ))}
            </div>
          </Card>
        );
      })}

      <Modal
        open={!!restock}
        onClose={() => setRestock(null)}
        title={restock ? `补货 — ${restock.product.name} EU ${restock.size}（当前 ${restock.stock}）` : ""}
      >
        {restock && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              restockOne(restock.product.id, restock.size, Number(e.target.elements.qty.value));
            }}
          >
            <label>补货数量（双）</label>
            <input name="qty" type="number" min="1" max="999" defaultValue={Math.max(3, 6 - restock.stock)} required autoFocus />
            <div className="adm-row" style={{ marginTop: 16 }}>
              <button className="adm-btn adm-btn-primary" type="submit" disabled={busy === "one"}>
                {busy === "one" ? "补货中…" : "确认补货"}
              </button>
              <button className="adm-btn adm-btn-outline" type="button" onClick={() => setRestock(null)}>取消</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
