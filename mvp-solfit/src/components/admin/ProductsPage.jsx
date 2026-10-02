/**
 * components/admin/ProductsPage — 商品管理（完整版）
 * 搜索/类目/状态筛选 + 新建/编辑（全字段表单弹窗）+ 上下架 + 库存与评分速览。
 */
"use client";

import { useMemo, useState } from "react";
import { useAdmin, useOverview, act, Card, Badge, Empty, Pills, Modal, usd } from "@/components/admin/ui";
import ImageUpload, { GalleryUpload } from "@/components/admin/ImageUpload";

const LAST_CODES = ["W1", "W2", "W3", "W4", "H1", "H2", "B1", "F1", "F2"];

export default function ProductsPage() {
  const { token } = useAdmin();
  const { data: ov, refresh } = useOverview();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState(null);   // null=新建打开用 {}；对象=编辑
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const products = ov?.products || [];

  const cats = useMemo(() => [...new Set(products.map((p) => p.category))], [products]);
  const list = useMemo(() => {
    let l = products;
    if (cat !== "all") l = l.filter((p) => p.category === cat);
    if (status === "listed") l = l.filter((p) => p.listed);
    if (status === "unlisted") l = l.filter((p) => !p.listed);
    const kw = q.trim().toLowerCase();
    if (kw) l = l.filter((p) => p.name.toLowerCase().includes(kw) || String(p.id) === kw);
    return l;
  }, [products, cat, status, q]);

  async function submit(fields) {
    setBusy("prod-save");
    setMsg(null);
    try {
      const payload = editing ? { action: "update", id: editing.id, patch: fields } : { action: "create", ...fields };
      const data = await act(token, "/api/admin/products", payload);
      setMsg(editing ? `${data.product.name} 已更新（推荐向量已重刷）` : `${data.product.name} 已创建（每码初始库存 6）`);
      setFormOpen(false); setEditing(null);
      await refresh();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }


  async function toggleListed(p) {
    setBusy(`prod-${p.id}`);
    setMsg(null);
    try {
      await act(token, "/api/admin/products", { action: p.listed ? "unlist" : "list", id: p.id });
      setMsg(`${p.name} ${p.listed ? "已下架（前台即刻不可见）" : "已重新上架"}`);
      await refresh();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!ov) return <Card title="商品管理"><Empty>加载中…</Empty></Card>;

  return (
    <>
      <Card>
        <div className="adm-row" style={{ justifyContent: "space-between" }}>
          <div className="adm-row">
            <Pills
              value={status}
              onChange={setStatus}
              items={[
                ["all", "全部", products.length],
                ["listed", "在售", products.filter((p) => p.listed).length],
                ["unlisted", "已下架", products.filter((p) => !p.listed).length],
              ]}
            />
            <select style={{ width: 140 }} value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">全部类目</option>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input style={{ width: 200 }} placeholder="搜索商品名 / ID" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="adm-btn adm-btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}>+ 新建商品</button>
        </div>
      </Card>

      {msg && <p style={{ color: "#1e7a41", fontSize: 12, margin: "0 0 12px" }}>✓ {msg}</p>}

      <Card title={`商品列表（${list.length}）`} small="价格/文案改动自动重刷推荐向量">
        {list.length ? (
          <table className="adm-table">
            <thead>
              <tr><th>商品</th><th>类目</th><th>售价</th><th>库存</th><th>评分</th><th>状态</th><th>操作</th></tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="adm-row" style={{ gap: 10, flexWrap: "nowrap" }}>
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8 }} />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: 8, background: "#eef0f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }} className="adm-muted">n/a</div>
                      )}
                      <div>
                        <a href={`/product/${p.id}`} target="_blank" style={{ fontWeight: 700 }}>{p.name}</a>
                        <div className="adm-muted" style={{ fontSize: 11 }}>#{p.id} · 楦 {p.lastCode} · {p.sizes.length} 码</div>
                      </div>
                    </div>
                  </td>
                  <td>{p.category}<div className="adm-muted" style={{ fontSize: 11 }}>{p.heel} · {p.widths.join("/")}</div></td>
                  <td>{usd(p.price)}{p.compareAt ? <div className="adm-muted" style={{ fontSize: 11, textDecoration: "line-through" }}>{usd(p.compareAt)}</div> : null}</td>
                  <td style={{ fontWeight: 700, color: p.stock === 0 ? "#b3362a" : p.oosCount ? "#b06e00" : undefined }}>
                    {p.stock}
                    {p.oosCount ? <div className="adm-muted" style={{ fontSize: 11 }}>{p.oosCount} 码缺货</div> : null}
                  </td>
                  <td className="adm-muted">{p.rating ? `${p.rating.toFixed(1)}（${p.reviewsCount}）` : "—"}</td>
                  <td><Badge tone={p.listed ? "ok" : "muted"}>{p.listed ? "在售" : "已下架"}</Badge></td>
                  <td>
                    <div className="adm-row" style={{ gap: 6 }}>
                      <button className="adm-btn adm-btn-outline adm-btn-sm" onClick={() => { setEditing(p); setFormOpen(true); }}>编辑</button>
                      <button
                        className={`adm-btn adm-btn-sm ${p.listed ? "adm-btn-danger" : "adm-btn-primary"}`}
                        disabled={busy === `prod-${p.id}`}
                        onClick={() => toggleListed(p)}
                      >
                        {busy === `prod-${p.id}` ? "…" : p.listed ? "下架" : "上架"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>无匹配商品</Empty>
        )}
      </Card>

      {/* ===== 新建/编辑弹窗（key 强制随编辑对象重建 —— 上传组件状态不串商品）===== */}
      <ProductModal
        key={editing ? `edit-${editing.id}` : "new"}
        open={formOpen}
        product={editing}
        busy={busy === "prod-save"}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={submit}
      />
    </>
  );
}

function ProductModal({ open, product, busy, onClose, onSubmit }) {
  const isEdit = !!product;
  const v = (k) => (product ? (Array.isArray(product[k]) ? product[k].join(", ") : product[k] ?? "") : "");
  // 图片走受控上传组件（本地上传/外链二选一），key 已保证切换商品时重建
  const [imgUrl, setImgUrl] = useState(product?.image || "");
  const [gallery, setGallery] = useState(product?.images || []);

  function submit(e) {
    e.preventDefault();
    const f = e.target.elements;
    onSubmit({
      name: f.name.value,
      category: f.category.value,
      price: Number(f.price.value),
      compareAt: f.compareAt.value ? Number(f.compareAt.value) : null,
      heel: f.heel.value,
      widths: f.widths.value,
      image: imgUrl,
      images: gallery,
      desc: f.desc.value,
      features: f.features.value,
      lastCode: f.lastCode.value,
      ...(isEdit ? {} : { sizes: f.sizes.value }),
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `编辑商品 — ${product.name}` : "新建商品"} width={760}>
      <form onSubmit={submit}>
        <div className="adm-form-grid">
          <div><label>名称 *</label><input name="name" defaultValue={v("name")} required /></div>
          <div><label>类目 *</label><input name="category" defaultValue={v("category")} placeholder="Loafers / Sneakers / Boots…" required /></div>
          <div><label>售价 (USD) *</label><input name="price" type="number" step="0.01" min="1" defaultValue={product ? product.price : ""} required /></div>
          <div><label>划线价 (USD)</label><input name="compareAt" type="number" step="0.01" min="0" defaultValue={product ? product.compareAt ?? "" : ""} placeholder="可空" /></div>
          <div><label>跟高</label><input name="heel" defaultValue={v("heel") || "Flat"} /></div>
          <div><label>宽窄（逗号分隔）</label><input name="widths" defaultValue={v("widths") || "Standard"} placeholder="Standard, Wide" /></div>
          <div>
            <label>楦型 *</label>
            <select name="lastCode" defaultValue={v("lastCode")} required disabled={isEdit} title={isEdit ? "楦型建档后不可改（尺码引擎依赖）" : ""}>
              {LAST_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {!isEdit && <div><label>尺码（逗号分隔）*</label><input name="sizes" placeholder="36, 37, 38, 39, 40" required /></div>}
        </div>

        {/* ===== 主图 + 详图（本地上传 / 外链皆可）===== */}
        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          <ImageUpload
            label="商品主图"
            value={imgUrl}
            onChange={setImgUrl}
            hint="列表页/购物车/SEO 缩略图用它；建议 1:1 方图，≤5MB（png/jpg/webp/gif）"
          />
          <GalleryUpload label="商品详图" value={gallery} onChange={setGallery} max={8} />
        </div>

        <div style={{ marginTop: 12 }}>
          <label>描述（商品页 SEO meta 的素材）</label><input name="desc" defaultValue={v("desc")} />
        </div>
        <div style={{ marginTop: 12 }}>
          <label>卖点（逗号分隔）</label><input name="features" defaultValue={v("features")} />
        </div>
        <div className="adm-row" style={{ marginTop: 18 }}>
          <button className="adm-btn adm-btn-primary" type="submit" disabled={busy}>{busy ? "保存中…" : isEdit ? "保存修改" : "创建商品"}</button>
          <button className="adm-btn adm-btn-outline" type="button" onClick={onClose}>取消</button>
          {isEdit && <span className="adm-muted" style={{ fontSize: 11 }}>编辑不改尺码与楦型（库存矩阵/评价归属依赖）；创建自动每码补 6 双初始库存</span>}
        </div>
      </form>
    </Modal>
  );
}
