/**
 * components/admin/ContentPage — 内容营销（SEO 长尾流量入口）
 * AI 草稿（人审铁律：生成只回填表单）→ 审校发布 → 上线/下线（sitemap 同步进出）。
 */
"use client";

import { useRef, useState } from "react";
import { useAdmin, useOverview, act, Card, Badge, Empty, fmtTime } from "@/components/admin/ui";

export default function ContentPage() {
  const { token } = useAdmin();
  const { data: ov, refresh } = useOverview();
  const postFormRef = useRef(null);
  const [genBusy, setGenBusy] = useState(false);
  const [genSource, setGenSource] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const posts = ov?.posts || [];
  const products = ov?.products || [];

  async function generate(e) {
    e.preventDefault();
    const topic = e.target.elements.topic.value;
    if (!topic) return;
    setGenBusy(true); setGenSource(null); setMsg(null);
    try {
      const res = await fetch("/api/ai/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ mode: "seo_post", topic, productId: e.target.elements.productId.value || undefined }),
      });
      const body = await res.json();
      if (body.code !== 0) throw new Error(body.message);
      const d = body.data;
      const f = postFormRef.current.elements; // 只回填表单 —— 审校后才可发布
      f.title.value = d.title;
      f.excerpt.value = d.excerpt;
      f.tags.value = (d.tags || []).join(", ");
      f.body.value = d.body;
      setGenSource(d.source);
      setMsg(`AI 草稿已生成（${d.source === "llm" ? "LLM" : "模板兜底"}）—— 请审校下方表单后发布`);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setGenBusy(false);
    }
  }

  async function publish(e) {
    e.preventDefault();
    const f = e.target.elements;
    setBusy("post-save");
    setMsg(null);
    try {
      await act(token, "/api/admin/posts", {
        action: "create",
        title: f.title.value, body: f.body.value,
        excerpt: f.excerpt.value, tags: f.tags.value, cover: f.cover.value,
      });
      setMsg(`文章《${f.title.value}》已发布（已进 sitemap + Article JSON-LD）`);
      e.target.reset();
      setGenSource(null);
      await refresh();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(p) {
    setBusy(`post-${p.slug}`);
    setMsg(null);
    try {
      await act(token, "/api/admin/posts", { action: p.published ? "unpublish" : "publish", slug: p.slug });
      setMsg(`《${p.title}》${p.published ? "已下线（退出前台与 sitemap）" : "已上线"}`);
      await refresh();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (!ov) return <Card title="内容营销"><Empty>加载中…</Empty></Card>;

  return (
    <>
      <Card title="AI 草稿生成" small="人审铁律：生成只回填表单，审校/改写后才发布（质量挂钩 E-E-A-T）">
        <form onSubmit={generate}>
          <div className="adm-form-grid">
            <div><label>主题 / 长尾关键词 *</label><input name="topic" placeholder="how to clean suede shoes" required /></div>
            <div><label>聚焦商品（可选）</label>
              <select name="productId" defaultValue="">
                <option value="">自动匹配</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "end" }}>
              <button className="adm-btn adm-btn-primary" type="submit" disabled={genBusy}>
                {genBusy ? "生成中…" : "生成草稿"}
              </button>
            </div>
          </div>
        </form>
      </Card>

      {msg && <p style={{ color: "#1e7a41", fontSize: 12, margin: "0 0 12px" }}>✓ {msg}</p>}

      <Card title="发布文章" small="slug 冲突自动加后缀 · 摘要即 meta description">
        <form ref={postFormRef} onSubmit={publish}>
          <div className="adm-form-grid">
            <div><label>标题 *</label><input name="title" placeholder="How to measure your feet at home" required /></div>
            <div><label>标签（逗号分隔）</label><input name="tags" placeholder="fit guide, wide feet" /></div>
          </div>
          <div style={{ marginTop: 12 }}><label>摘要（≤200 字，作 meta description）</label><input name="excerpt" placeholder="留空则自动截取正文" /></div>
          <div style={{ marginTop: 12 }}><label>封面图 URL</label><input name="cover" placeholder="https://…" /></div>
          <div style={{ marginTop: 12 }}><label>正文（空行分段）*</label><textarea name="body" rows={6} required /></div>
          <div className="adm-row" style={{ marginTop: 14 }}>
            <button className="adm-btn adm-btn-primary" type="submit" disabled={busy === "post-save"}>
              {busy === "post-save" ? "发布中…" : "发布文章"}
            </button>
            {genSource && <Badge tone="info">{genSource === "llm" ? "AI 草稿 · 审校后发布" : "模板草稿 · 可再生成"}</Badge>}
          </div>
        </form>
      </Card>

      <Card title={`文章列表（${posts.length}）`} small="已上线文章自动进 sitemap 并注入 Article JSON-LD">
        {posts.length ? (
          <table className="adm-table">
            <thead><tr><th>文章</th><th>标签</th><th>字数</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.slug}>
                  <td style={{ maxWidth: 320 }}>
                    <a href={`/blog/${p.slug}`} target="_blank" style={{ fontWeight: 700 }}>{p.title}</a>
                    <div className="adm-muted" style={{ fontSize: 11 }}>/blog/{p.slug} · {p.excerpt.slice(0, 50)}{p.excerpt.length > 50 ? "…" : ""}</div>
                  </td>
                  <td>{(p.tags || []).map((t) => <span key={t} className="adm-tag">{t}</span>)}</td>
                  <td className="adm-muted">{p.wordCount}</td>
                  <td><Badge tone={p.published ? "ok" : "muted"}>{p.published ? "已上线" : "已下线"}</Badge></td>
                  <td className="adm-muted" style={{ fontSize: 11 }}>{fmtTime(p.updatedAt)}</td>
                  <td>
                    <button
                      className={`adm-btn adm-btn-sm ${p.published ? "adm-btn-outline" : "adm-btn-primary"}`}
                      disabled={busy === `post-${p.slug}`}
                      onClick={() => toggle(p)}
                    >
                      {busy === `post-${p.slug}` ? "…" : p.published ? "下线" : "上线"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>暂无文章 —— 用 AI 草稿发第一篇</Empty>
        )}
      </Card>
    </>
  );
}
