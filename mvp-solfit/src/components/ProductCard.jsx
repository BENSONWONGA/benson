/**
 * components/ProductCard — 商品卡（服务端组件，SEO 可见）
 * currency: 服务端传入的展示币种（cookie 偏好）
 */

import { formatMoney } from "@/lib/currency";

export default function ProductCard({ product, currency = "USD" }) {
  return (
    <a className="product-card" href={`/product/${product.id}`}>
      <div className="thumb">
        {/* next/image：CDN 域名在 next.config.mjs 配置 */}
        <img src={product.image} alt={product.name} loading="lazy" />
      </div>
      <div className="info">
        <span className="name">{product.name}</span>
        <span className="meta">
          {product.category} · {product.heel} heel
          {product.widths.includes("Wide") ? <span className="badge-ai badge" style={{ marginLeft: 8 }}>Wide last</span> : null}
        </span>
        <span>
          <span className="price">{formatMoney(product.price, currency)}</span>
          {product.compareAt ? <span className="strike">{formatMoney(product.compareAt, currency)}</span> : null}
        </span>
        <span className="meta">★ {product.rating} ({product.reviewsCount.toLocaleString()})</span>
      </div>
    </a>
  );
}
