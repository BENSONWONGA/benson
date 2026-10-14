/**
 * app/blog/page.jsx — 内容列表（Journal）
 * SSR 渲染发布中文章；标签即长尾词入口（内链到 /shop 筛选形成 SEO 闭环）。
 */

import Link from "next/link";
import { listPosts } from "@/modules/content/service";

export const metadata = {
  title: "Fit Journal — Guides & size charts",
  description: "Honest fit guides: wide feet, EU-to-US size conversion, and leather care from the SOLFIT fit team.",
};

export const dynamic = "force-dynamic";

export default function BlogPage() {
  const posts = listPosts();

  return (
    <div className="container" style={{ padding: "48px 24px 80px", maxWidth: 900 }}>
      <div className="eyebrow">The Fit Journal</div>
      <h1 style={{ fontSize: 40, margin: "8px 0 12px" }}>Fit guides that don't lie.</h1>
      <p className="lede" style={{ marginTop: 0, marginBottom: 40 }}>
        Sizing truth, last shapes, and care — written by the team that measures feet every day.
      </p>

      <div style={{ display: "grid", gap: 40 }}>
        {posts.map((p) => (
          <article key={p.slug} className="product-card" style={{ padding: 0, overflow: "hidden" }}>
            {p.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <Link href={`/blog/${p.slug}`} aria-label={p.title}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.cover} alt={p.title} style={{ width: "100%", height: 260, objectFit: "cover", display: "block" }} />
              </Link>
            ) : null}
            <div style={{ padding: "20px 22px 24px" }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {p.tags.map((t) => (
                  <span key={t} className="chip" style={{ fontSize: 11, padding: "3px 10px" }}>{t}</span>
                ))}
              </div>
              <Link href={`/blog/${p.slug}`} style={{ color: "inherit", textDecoration: "none" }}>
                <h2 style={{ fontSize: 22, margin: "0 0 8px", lineHeight: 1.35 }}>{p.title}</h2>
              </Link>
              <p className="muted" style={{ margin: "0 0 14px", lineHeight: 1.6 }}>{p.excerpt}</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="muted" style={{ fontSize: 12 }}>{p.author} · {p.createdAt.slice(0, 10)}</span>
                <Link href={`/blog/${p.slug}`} style={{ fontWeight: 700, color: "var(--fit)" }}>Read guide →</Link>
              </div>
            </div>
          </article>
        ))}
        {!posts.length && <p className="muted">No guides published yet.</p>}
      </div>
    </div>
  );
}
