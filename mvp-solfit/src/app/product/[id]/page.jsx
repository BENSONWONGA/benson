/**
 * app/product/[id]/page.jsx — 商品详情（SSR + generateMetadata：Product schema 结构化数据）
 * 交互岛：ProductClient（尺码选择 / AI Size Finder / 加购）
 */

import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getProduct, LAST_LIBRARY } from "@/modules/catalog/service";
import { recommend } from "@/ai/recommender";
import { peekSessionId } from "@/lib/db";
import { getCurrencyFromCookies, formatMoney } from "@/lib/currency";
import { listReviews, reviewSummary, reviewStatus } from "@/modules/reviews/service";
import ProductCard from "@/components/ProductCard";
import ProductClient from "@/components/ProductClient";
import ReviewForm from "@/components/ReviewForm";

export async function generateMetadata({ params }) {
  const product = await getProduct(params.id);
  if (!product) return { title: "Not found" };
  // 已下架商品：保留详情但退出索引（nocache 意义上的"软下架"由页面 notFound 兜底）
  if (product.listed === false) return { title: "Not available", robots: { index: false, follow: false } };
  return {
    title: product.name,
    description: product.desc,
    openGraph: { images: [product.image] },
  };
}

/** 结构化数据 —— 独立站 SEO 命脉（Google Merchant / 富摘要） */
function productJsonLd(product) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: product.image,
    description: product.desc,
    brand: { "@type": "Brand", name: "SOLFIT" },
    offers: {
      "@type": "Offer",
      price: product.price,
      priceCurrency: product.currency || "USD",
      availability: product.oos.length < product.sizes.length
        ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
    aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating, reviewCount: product.reviewsCount },
  };
}

export default async function ProductPage({ params }) {
  const product = await getProduct(params.id);
  if (!product || product.listed === false) notFound(); // 已下架同 404 —— 前台/AI 检索均不可达

  const currency = getCurrencyFromCookies(cookies());
  const last = LAST_LIBRARY[product.lastCode];
  // 评价区块（Phase 18）：SSR 列表 + 聚合摘要 + 本会话可评状态（UGC 是 SEO 富素材）
  const [reviews, summary, reviewState] = [
    listReviews(product.id),
    reviewSummary(product.id),
    reviewStatus(peekSessionId(), product.id),
  ];
  // Phase 3 个性化：种子商品相关推荐（CF + 结构相似；无会话行为自动降级）
  const related = await recommend({
    sessionId: peekSessionId(),
    seedProductId: product.id,
    excludeId: product.id,
    max: 4,
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(product)) }} />
      <div className="pdp">
        <div>
          <img className="pdp-main-img" src={product.image} alt={product.name} />
        </div>
        <div>
          {product.badge ? <span className="badge">{product.badge}</span> : null}{" "}
          <span className="muted">{product.category} · Last {product.lastCode}</span>
          <h1>{product.name}</h1>
          <p className="muted" style={{ fontSize: 13 }}>★ {product.rating} · {product.reviewsCount.toLocaleString()} verified reviews</p>
          <p style={{ margin: "12px 0" }}>
            <span className="price" style={{ fontSize: 20 }}>{formatMoney(product.price, currency)}</span>
            {product.compareAt ? <span className="strike">{formatMoney(product.compareAt, currency)}</span> : null}
          </p>
          <p className="lede" style={{ fontSize: 14 }}>{product.desc}</p>
          <div className="fit-strip">
            <b>Fit Intelligence</b> — Last {product.lastCode} ({last?.name}) runs {last?.runs}.
            {last?.widthNote ? " " + last.widthNote : ""}
          </div>

          {/* 交互岛：宽窄/尺码/AI Size Finder/加购 */}
          <ProductClient product={product} />

          <ul className="ship-list">
            <li>3–5 day express from US / EU warehouses</li>
            <li>Free size exchanges within 60 days</li>
            <li>Duties &amp; taxes shown at checkout (stub)</li>
          </ul>
        </div>
      </div>

      {/* ===== 评价区块（Phase 18：UGC 社会证明 —— SSR 供 SEO 长尾词）===== */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <h2 style={{ marginBottom: 20 }}>Reviews from people who bought this pair</h2>
          <div className="order-grid" style={{ gridTemplateColumns: "280px 1fr", alignItems: "start" }}>
            <aside className="cart-summary">
              <h3>Rating overview</h3>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 40, fontWeight: 800 }}>{summary.rating ? summary.rating.toFixed(1) : "—"}</span>
                <span style={{ color: "#D4880F" }}>{"★".repeat(Math.round(summary.rating))}</span>
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>{summary.reviewsCount} review{summary.reviewsCount === 1 ? "" : "s"}</p>
              <div style={{ marginTop: 12 }}>
                {[5, 4, 3, 2, 1].map((n) => {
                  const count = summary.distribution[n] || 0;
                  const pct = summary.reviewsCount ? (count / summary.reviewsCount) * 100 : 0;
                  return (
                    <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 4 }}>
                      <span className="muted" style={{ width: 10 }}>{n}</span>
                      <div style={{ background: "#EFE8DC", borderRadius: 999, height: 6, flex: 1, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "#D4880F" }} />
                      </div>
                      <span className="muted" style={{ width: 18, textAlign: "right" }}>{count}</span>
                    </div>
                  );
                })}
              </div>
              {summary.fitStats && (
                <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                  Fit feedback: {summary.fitStats.true}% true to size · {summary.fitStats.small}% small · {summary.fitStats.large}% large
                </p>
              )}
            </aside>
            <div>
              <div style={{ display: "grid", gap: 16, marginBottom: 28 }}>
                {reviews.length ? reviews.map((r) => (
                  <div key={r.id} className="product-card" style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div>
                        <span style={{ color: "#D4880F" }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                        {r.verified ? <span className="badge" style={{ fontSize: 10, marginLeft: 8 }}>Verified purchase</span> : null}
                      </div>
                      <span className="muted" style={{ fontSize: 12 }}>{r.author} · {r.createdAt.slice(0, 10)}</span>
                    </div>
                    {r.title ? <b style={{ display: "block", marginTop: 8 }}>{r.title}</b> : null}
                    <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.6 }}>{r.body}</p>
                    {r.fit ? <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>Fit: {r.fit.replace(/_/g, " ")}</p> : null}
                  </div>
                )) : (
                  <p className="muted">No reviews yet — buyers of this pair will show up here.</p>
                )}
              </div>
              <h3 style={{ fontSize: 18, marginBottom: 10 }}>Write a review</h3>
              <ReviewForm productId={product.id} status={reviewState} />
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 style={{ marginBottom: 20 }}>Pairs that fit the other days of your week</h2>
          <div className="product-grid">
            {related.map((p) => <ProductCard key={p.id} product={p} currency={currency} />)}
          </div>
        </div>
      </section>
    </>
  );
}
