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
import ProductCard from "@/components/ProductCard";
import ProductClient from "@/components/ProductClient";

export async function generateMetadata({ params }) {
  const product = await getProduct(params.id);
  if (!product) return { title: "Not found" };
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
  if (!product) notFound();

  const currency = getCurrencyFromCookies(cookies());
  const last = LAST_LIBRARY[product.lastCode];
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
