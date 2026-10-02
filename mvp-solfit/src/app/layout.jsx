import "./globals.css";
import { cookies } from "next/headers";
import StylistChat from "@/components/StylistChat";
import CartBadge from "@/components/CartBadge";
import CurrencySwitcher from "@/components/CurrencySwitcher";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import CookieConsent from "@/components/CookieConsent";
import WebVitalsReporter from "@/components/WebVitalsReporter";
import { getThemeFromCookies, themeCss } from "@/lib/themes";
import { getLangFromCookies } from "@/lib/i18n";
import { getSiteSettings } from "@/lib/site-settings";

/**
 * 跨境 SEO：hreflang 需在多语言上线时按 locale 展开（方案文档 §6.2）。
 * 主题（10 套 UI 模板）与语言同款 cookie 偏好 —— SSR 注入 :root 变量覆盖。
 */
export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://solfit.example"),
  title: { default: "SOLFIT — The pair that fits. Guaranteed.", template: "%s — SOLFIT" },
  description: "AI-fitted footwear. Find your exact size in 60 seconds, guaranteed to fit or free exchange.",
  openGraph: { siteName: "SOLFIT", type: "website" },
};

export default function RootLayout({ children }) {
  const jar = cookies();
  const theme = getThemeFromCookies(jar);
  const css = themeCss(theme);
  const lang = getLangFromCookies(jar);
  const settings = getSiteSettings(); // 总后台站点设置（公告栏 / 维护模式）

  return (
    <html lang={lang}>
      <body>
        {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
        {settings.maintenance ? (
          <div style={{ background: "#C0392B", color: "#fff", textAlign: "center", fontSize: 12, letterSpacing: "0.06em", padding: "8px 16px" }}>
            站点维护中 —— 暂停下单，浏览不受影响
          </div>
        ) : null}
        {settings.announcement ? <div className="announce">{settings.announcement}</div> : null}
        <header className="site-header">
          <div className="header-inner">
            <a className="logo" href="/">SOL<em>FIT</em></a>
            <nav className="main-nav">
              <a href="/shop">Shop</a>
              <a href="/">Why SOLFIT</a>
              <a href="/#fit-science">Fit Science</a>
              <a href="/blog">Journal</a>
            </nav>
            <div className="header-actions">
              <LanguageSwitcher />
              <CurrencySwitcher />
              <a href="/account" aria-label="My account" style={{ fontSize: 14, fontWeight: 600, marginLeft: 8 }}>
                Account
              </a>
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
              <p><a href="/admin/master">Master console（总后台）</a></p>
              <p><a href="/admin/merchant">Merchant console</a></p>
              <p><a href="/admin/baseline">Baseline dashboard</a></p>
              <p><a href="/admin/monitoring">Monitoring dashboard</a></p>
              <p><a href="/embed/demo">Size widget for brands</a></p>
              <p><a href="/privacy">Privacy &amp; data</a></p>
              <p><a href="/api/analytics/baseline">Baseline API</a></p>
            </div>
          </div>
        </footer>
        <StylistChat />
        <CookieConsent />
        <WebVitalsReporter />
      </body>
    </html>
  );
}
