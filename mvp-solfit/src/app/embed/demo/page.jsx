/**
 * app/embed/demo — 尺码组件接入演示（B2B 获客页：宿主站如何 24h 接入）
 * 实嵌 iframe 预览 + 接入代码片段 + 三步说明。允许索引（获客 SEO）。
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://solfit.example";

export const metadata = {
  title: "Size Finder widget — embed in a day",
  description: "Add AI shoe-size recommendations to your product pages with one line of code. Verified-purchase fit data, free exchanges, live in 24 hours.",
};

export default function EmbedDemoPage() {
  const snippet = `<iframe
  src="${SITE}/embed/size-finder"
  title="Find your size"
  style="width:100%;max-width:420px;height:520px;border:0"
  loading="lazy"
></iframe>`;

  return (
    <div className="container" style={{ padding: "48px 24px 80px", maxWidth: 860 }}>
      <div className="eyebrow">For footwear brands &amp; retailers</div>
      <h1 style={{ fontSize: 36, margin: "8px 0 12px" }}>The size widget your PDP is missing.</h1>
      <p className="lede" style={{ margin: "0 0 8px" }}>
        One iframe. Live in 24 hours. No SKU mapping, no data pipeline on your side.
      </p>
      <p className="muted" style={{ marginBottom: 36 }}>
        Sizing-related returns are the #1 cost line in footwear e-commerce. Our widget routes shoppers
        to the right EU size before checkout — backed by verified-purchase fit data and free-exchange loops.
      </p>

      {/* 实嵌预览（右）+ 接入三步（左） */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 32, alignItems: "start" }}>
        <div>
          <h3 style={{ fontSize: 18, margin: "0 0 12px" }}>Integrate in three steps</h3>
          <ol style={{ lineHeight: 1.9, paddingLeft: 20, margin: 0 }}>
            <li>Paste the iframe snippet into your product template.</li>
            <li>We map your brand&rsquo;s lasts against our fit library — you send a size chart, we do the rest.</li>
            <li>Shoppers get a size on-site; sizing-return signals flow back weekly.</li>
          </ol>
          <h3 style={{ fontSize: 18, margin: "24px 0 12px" }}>The snippet</h3>
          <pre className="mono" style={{ background: "#EFE8DC", padding: 16, borderRadius: 12, fontSize: 12.5, overflowX: "auto", lineHeight: 1.6, margin: 0 }}>
            {snippet}
          </pre>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            GDPR-safe: no cookies dropped on your domain, answers processed in-session.
          </p>
        </div>

        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Live preview — this is the real widget:</div>
          {/* 实嵌自家组件页：与第三方宿主完全同款体验 */}
          <iframe
            src="/embed/size-finder"
            title="Size Finder widget preview"
            style={{ width: "100%", maxWidth: 420, height: 560, border: "1px solid var(--border)", borderRadius: 14, background: "#fff" }}
          />
        </div>
      </div>

      <div className="product-card" style={{ padding: 18, marginTop: 40 }}>
        <b>Pricing (skeleton):</b> free up to 500 widget sessions/mo, then 0.02 USD per recommendation.
        Sizing-return reporting included from day one.
      </div>
    </div>
  );
}
