/**
 * app/blog/[slug]/page.jsx — 文章详情（SSR 全文 + Article JSON-LD 富摘要）
 *
 * SEO 闭环：正文按标签内链到 /shop 筛选页（宽脚指南 → /shop?width=Wide），
 * 底部相关商品（宽脚文章推 Wide 楦）把内容流量导向转化。
 * 正文是纯文本分段（\n\n 分段渲染，零依赖铁律 —— 不引 markdown 库）。
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, listPosts } from "@/modules/content/service";
import { listProducts } from "@/modules/catalog/service";
import ProductCard from "@/components/ProductCard";
import { getCurrencyFromCookies } from "@/lib/currency";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://solfit.example";

/** 标签 → 商店筛选参数（内容内链是独立站外链之外最强的站内信号） */
const TAG_SHOP_LINKS = {
  "wide feet": "/shop?width=Wide",
  "fit guide": "/shop?width=Wide",
  "size chart": "/shop",
  conversion: "/shop",
  care: "/shop?category=Loafers",
  leather: "/shop?category=Loafers",
};

export async function generateMetadata({ params }) {
  const post = getPost(params.slug);
  if (!post || !post.published) return { title: "Not found" };
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: { type: "article", title: post.title, description: post.excerpt, images: post.cover ? [post.cover] : [] },
  };
}

export default async function BlogPostPage({ params }) {
  const post = getPost(params.slug);
  // 未发布文章：前台 404（商家后台仍可见，退出 sitemap）
  if (!post || !post.published) notFound();

  const currency = getCurrencyFromCookies(cookies());
  const paragraphs = post.body.split(/\n{2,}/).filter(Boolean);

  // 相关商品：宽脚/楦型相关标签优先推 Wide 可穿款，否则按类目推
  const wantsWide = post.tags.some((t) => ["wide feet", "fit guide"].includes(t));
  const related = (listProducts(wantsWide ? { width: "Wide" } : {}).slice(0, 3));

  // 相关阅读：其余发布中文章（最多 2 篇）
  const more = listPosts().filter((p) => p.slug !== post.slug).slice(0, 2);

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    image: post.cover ? [post.cover] : undefined,
    author: { "@type": "Organization", name: post.author },
    publisher: { "@type": "Organization", name: "SOLFIT" },
    datePublished: post.createdAt,
    dateModified: post.updatedAt,
    mainEntityOfPage: `${BASE}/blog/${post.slug}`,
    keywords: post.tags.join(", "),
  };

  return (
    <div className="container" style={{ padding: "48px 24px 80px", maxWidth: 760 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />

      <Link href="/blog" className="muted" style={{ fontSize: 13 }}>← Fit Journal</Link>
      <h1 style={{ fontSize: 34, lineHeight: 1.25, margin: "16px 0 12px" }}>{post.title}</h1>
      <p className="muted" style={{ margin: "0 0 8px", fontSize: 13 }}>
        {post.author} · {post.createdAt.slice(0, 10)} · {post.body.split(/\s+/).length} words
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0 24px" }}>
        {post.tags.map((t) =>
          TAG_SHOP_LINKS[t] ? (
            <Link key={t} href={TAG_SHOP_LINKS[t]} className="chip active" style={{ fontSize: 11, padding: "3px 10px" }}>{t}</Link>
          ) : (
            <span key={t} className="chip" style={{ fontSize: 11, padding: "3px 10px" }}>{t}</span>
          )
        )}
      </div>

      {post.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.cover} alt={post.title} style={{ width: "100%", borderRadius: 14, marginBottom: 28 }} />
      ) : null}

      <div style={{ fontSize: 17, lineHeight: 1.8 }}>
        {paragraphs.map((para, i) => (
          <p key={i} style={{ marginBottom: 20 }}>{para}</p>
        ))}
      </div>

      {/* ===== 内链到商店（标签 → 筛选）===== */}
      {post.tags.some((t) => TAG_SHOP_LINKS[t]) && (
        <div className="product-card" style={{ padding: 18, marginTop: 8 }}>
          <b>Shop this guide</b>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {[...new Set(post.tags.map((t) => TAG_SHOP_LINKS[t]).filter(Boolean))].map((href) => (
              <Link key={href} href={href} className="btn btn-sm btn-primary">
                Browse {href.includes("Wide") ? "wide-fit shoes" : "the collection"}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ===== 相关商品（内容 → 转化）===== */}
      {related.length > 0 && (
        <>
          <h2 style={{ fontSize: 22, margin: "48px 0 16px" }}>Pairs made for this</h2>
          <div className="product-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
            {related.map((p) => <ProductCard key={p.id} product={p} currency={currency} />)}
          </div>
        </>
      )}

      {/* ===== 相关阅读 ===== */}
      {more.length > 0 && (
        <>
          <h2 style={{ fontSize: 22, margin: "48px 0 12px" }}>Keep reading</h2>
          {more.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="product-card" style={{ display: "block", padding: 16, marginBottom: 10, textDecoration: "none", color: "inherit" }}>
              <b>{p.title}</b>
              <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>{p.excerpt}</p>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
