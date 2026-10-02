/**
 * app/page.jsx — 首页（SSR：SEO 是独立站命脉，见方案文档 §6.2）
 * 商品数据服务端直出；AI 推荐 Phase 3 起按会话行为个性化（ai/recommender）
 * 多语言（cookie solfit_lang · 骨架期首页全量文案）+ 主题选择（ThemePicker）
 */

import Link from "next/link";
import { cookies } from "next/headers";
import { listProducts } from "@/modules/catalog/service";
import { recommend } from "@/ai/recommender";
import { peekSessionId } from "@/lib/db";
import { getCurrencyFromCookies } from "@/lib/currency";
import { HOME_TEXT, getLangFromCookies } from "@/lib/i18n";
import ProductCard from "@/components/ProductCard";
import ThemePicker from "@/components/ThemePicker";

export const dynamic = "force-dynamic"; // 货币/语言/主题按会话渲染（SEO 策略见方案 §6.2：ISR + 边缘个性化）

export default async function HomePage() {
  const jar = cookies();
  const t = HOME_TEXT[getLangFromCookies(jar)];
  const currency = getCurrencyFromCookies(jar);
  const featured = listProducts({ sort: "rating" }).slice(0, 4);
  // Phase 3 个性化：有会话行为走 CF+特征排序，否则冷启动（SSR 只读 cookie，不新建会话）
  const recommended = await recommend({ sessionId: peekSessionId(), max: 4 });

  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">{t.heroEyebrow}</div>
          <h1>{t.heroH1}</h1>
          <p className="lede">{t.heroLede}</p>
          <div className="hero-cta">
            <Link className="btn btn-fit" href="/product/1">{t.ctaFind}</Link>
            <Link className="btn btn-outline" href="/shop">{t.ctaShop}</Link>
          </div>
        </div>
        <div className="hero-photo">
          <img
            src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=elegant%20young%20woman%20walking%20on%20sunlit%20european%20street%20wearing%20cream%20minimalist%20sneakers%2C%20editorial%20fashion%20photography%2C%20warm%20morning%20light&image_size=portrait_4_3"
            alt={t.heroAlt}
          />
        </div>
      </section>

      {/* ===== UI 模板选择（10 套主题 · cookie 持久化）===== */}
      <section className="section" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="container">
          <ThemePicker labels={{ eyebrow: t.themeEyebrow, title: t.themeTitle, hint: t.themeHint }} />
        </div>
      </section>

      <section className="section" id="fit-science" style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="container">
          <div className="eyebrow">{t.recEyebrow}</div>
          <h2 style={{ marginBottom: 24 }}>{t.recH2}</h2>
          <div className="product-grid">
            {recommended.map((p) => <ProductCard key={p.id} product={p} currency={currency} />)}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="eyebrow">{t.topEyebrow}</div>
          <h2 style={{ marginBottom: 24 }}>{t.topH2}</h2>
          <div className="product-grid">
            {featured.map((p) => <ProductCard key={p.id} product={p} currency={currency} />)}
          </div>
        </div>
      </section>
    </>
  );
}
