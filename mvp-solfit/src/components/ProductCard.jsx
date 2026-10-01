/**
 * components/ProductCard — 商品卡（服务端组件，SEO 可见）
 */

export default function ProductCard({ product }) {
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
          <span className="price">${product.price}</span>
          {product.compareAt ? <span className="strike">${product.compareAt}</span> : null}
        </span>
        <span className="meta">★ {product.rating} ({product.reviewsCount.toLocaleString()})</span>
      </div>
    </a>
  );
}
