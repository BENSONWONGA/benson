import "./globals.css";
import StylistChat from "@/components/StylistChat";
import CartBadge from "@/components/CartBadge";
import CurrencySwitcher from "@/components/CurrencySwitcher";
import CookieConsent from "@/components/CookieConsent";

/**
 * 跨境 SEO：hreflang 需在多语言上线时按 locale 展开（方案文档 §6.2）
 */
export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://solfit.example"),
  title: { default: "SOLFIT — The pair that fits. Guaranteed.", template: "%s — SOLFIT" },
  description: "AI-fitted footwear. Find your exact size in 60 seconds, guaranteed to fit or free exchange.",
  openGraph: { siteName: "SOLFIT", type: "website" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="announce">Free size exchanges on every order — the SOLFIT Fit Guarantee</div>
        <header className="site-header">
          <div className="header-inner">
            <a className="logo" href="/">SOL<em>FIT</em></a>
            <nav className="main-nav">
              <a href="/shop">Shop</a>
              <a href="/">Why SOLFIT</a>
              <a href="/#fit-science">Fit Science</a>
            </nav>
            <div className="header-actions">
              <CurrencySwitcher />
              <a href="/cart" aria-label="Open cart" style={{ marginLeft: 8 }}><CartBadge /></a>
            </div>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="footer-inner">
            <div>
              <div className="logo" style={{ color: "#F4EFE6" }}>SOL<em>FIT</em></div>
              <p className="muted" style={{ marginTop: 8, maxWidth: 300, lineHeight: 1.7 }}>
                Phase 1 MVP — 电商闭环 + 多币种 + 物流/税务/GDPR 基建 + 转化基线. Duties &amp; taxes quoted at checkout.
              </p>
            </div>
            <div>
              <p style={{ fontWeight: 700, marginBottom: 8 }}>Shop</p>
              <p><a href="/shop?category=Loafers">Loafers</a></p>
              <p><a href="/shop?category=Sneakers">Sneakers</a></p>
              <p><a href="/shop?width=Wide">Wide fit</a></p>
            </div>
            <div>
              <p style={{ fontWeight: 700, marginBottom: 8 }}>Operations</p>
              <p><a href="/admin/baseline">Baseline dashboard</a></p>
              <p><a href="/privacy">Privacy &amp; data</a></p>
              <p><a href="/api/analytics/baseline">Baseline API</a></p>
            </div>
          </div>
        </footer>
        <StylistChat />
        <CookieConsent />
      </body>
    </html>
  );
}
