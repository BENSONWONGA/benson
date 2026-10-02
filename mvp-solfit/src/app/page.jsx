/**
 * app/page.jsx — 首页（Phase 23 潮流运动版式：黑白高对比 + volt 冲击色）
 * 结构：全幅 Hero → 跑马灯 → USP → 本周主打 → AI 匹配（暗）→ 品牌故事（暗）→
 *       Fit Science 三步（暗）→ FAQ → 订阅带。SEO：SSR 直出 + 首页 meta 可后台覆盖。
 * 主题由商家后台「品牌装修」统一管理（默认/锁定）；访客自选 cookie 仍生效（不锁定时）。
 */

import Link from "next/link";
import { cookies } from "next/headers";
import { listProducts } from "@/modules/catalog/service";
import { recommend } from "@/ai/recommender";
import { peekSessionId } from "@/lib/db";
import { HOME_TEXT, getLangFromCookies } from "@/lib/i18n";
import { getSiteSettings } from "@/lib/site-settings";
import ProductCard from "@/components/ProductCard";
import NewsletterForm from "@/components/NewsletterForm";
import { getCurrencyFromCookies } from "@/lib/currency";

export const dynamic = "force-dynamic"; // 货币/语言/装修按会话渲染（SEO 策略见方案 §6.2：ISR + 边缘个性化）

/** 首页 meta（商家后台"SEO 设置"可覆盖 title/description/keywords；空 = 默认） */
export function generateMetadata() {
  const s = getSiteSettings();
  const md = {};
  if (s.seo.title) md.title = { absolute: s.seo.title };
  if (s.seo.description) md.description = s.seo.description;
  if (s.seo.keywords) md.keywords = s.seo.keywords;
  return md;
}

const DEFAULT_HERO_IMAGE = "/img/hero.jpg";

export default async function HomePage() {
  const jar = cookies();
  const lang = getLangFromCookies(jar);
  const settings = getSiteSettings(); // 商家后台"首页装修/SEO"写入口
  // 文案合并：默认字典 + 后台装修覆盖（空字段已在保存时剔除 = 回落默认）
  const t = { ...HOME_TEXT[lang], ...(settings.homeContent?.[lang] || {}) };
  const currency = getCurrencyFromCookies(jar);
  const featured = listProducts({ sort: "rating" }).slice(0, 4);
  // Phase 3 个性化：有会话行为走 CF+特征排序，否则冷启动（SSR 只读 cookie，不新建会话）
  const recommended = await recommend({ sessionId: peekSessionId(), max: 4 });
  const marqueeHalf = t.marquee.repeat(3);

  return (
    <>
      {/* ===== Hero（全幅战役图 + 大字报）===== */}
      <section className="ath-hero">
        <div className="ath-hero-bg">
          <img src={settings.homeHeroImage || DEFAULT_HERO_IMAGE} alt="" />
        </div>
        <div className="ath-hero-inner">
          <div className="ath-tag">{t.heroEyebrow}</div>
          <h1>{t.heroH1}</h1>
          <p className="lede">{t.heroLede}</p>
          <div className="ath-cta">
            <Link className="btn-ath btn-ath-volt" href="/product/1">{t.ctaFind}</Link>
            <Link className="btn-ath btn-ath-ghost" href="/shop">{t.ctaShop}</Link>
          </div>
          <div className="ath-hero-foot">
            <span><b>60s</b>AI FIT SCAN</span>
            <span><b>60d</b>FREE EXCHANGES</span>
            <span><b>US/EU</b>EXPRESS</span>
          </div>
        </div>
      </section>

      {/* ===== 跑马灯 ===== */}
      <div className="marquee" aria-hidden>
        <div className="marquee-track">
          <span>{marqueeHalf}</span>
          <span>{marqueeHalf}</span>
        </div>
      </div>

      {/* ===== USP ===== */}
      <section className="container">
        <div className="usp-grid">
          {(t.usps || []).map(([title, sub]) => (
            <div key={title} className="usp-cell">
              <b>{title}</b>
              <span>{sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 本周主打 ===== */}
      <section className="ath-sec" id="drop">
        <div className="container">
          <div className="sec-eyebrow">{t.topEyebrow}</div>
          <h2 className="sec-h2">{t.topH2}</h2>
          <div className="product-grid">
            {featured.map((p) => <ProductCard key={p.id} product={p} currency={currency} />)}
          </div>
        </div>
      </section>

      {/* ===== AI 匹配（暗区）===== */}
      <section className="ath-sec ath-sec--dark">
        <div className="container">
          <div className="sec-eyebrow on-dark">{t.recEyebrow}</div>
          <h2 className="sec-h2" style={{ color: "#fff" }}>{t.recH2}</h2>
          <div className="product-grid">
            {recommended.map((p) => <ProductCard key={p.id} product={p} currency={currency} />)}
          </div>
        </div>
      </section>

      {/* ===== 品牌故事（暗区延续）===== */}
      <section className="ath-sec--dark" id="story" style={{ padding: "0 0 84px" }}>
        <div className="container">
          <div className="story-grid">
            <div className="story-media">
              <img src="/img/brand.jpg" alt="AI foot pressure scan in the SOLFIT fit lab" />
            </div>
            <div>
              <div className="sec-eyebrow on-dark">{t.storyEyebrow}</div>
              <h2 className="sec-h2" style={{ color: "#fff" }}>{t.storyH2}</h2>
              <p className="lede">{t.storyBody}</p>
              <div className="story-stats">
                {(t.storyStats || []).map(([num, label]) => (
                  <div key={label} className="story-stat">
                    <b>{num}</b>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <Link className="btn-ath btn-ath-volt" href="/#fit-science">{t.storyCta}</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Fit Science 三步（暗区收尾）===== */}
      <section className="ath-sec--dark" id="fit-science" style={{ paddingBottom: 96 }}>
        <div className="container">
          <div className="sec-eyebrow on-dark">{t.scienceEyebrow}</div>
          <h2 className="sec-h2" style={{ color: "#fff", marginBottom: 0 }}>{t.scienceH2}</h2>
          <div className="steps-grid">
            {(t.steps || []).map(([num, title, desc]) => (
              <div key={num} className="step-card">
                <div className="num">{num}</div>
                <b>{title}</b>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="ath-sec" id="faq">
        <div className="container">
          <div className="sec-eyebrow">FAQ</div>
          <h2 className="sec-h2">{t.faqH2}</h2>
          <div className="faq-list">
            {(t.faqs || []).map(([q, a]) => (
              <details key={q} className="faq-item">
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 订阅带 ===== */}
      <section className="news-band">
        <div className="container">
          <div className="news-inner">
            <div>
              <h2>{t.newsH2}</h2>
              <p className="sub">{t.newsSub}</p>
            </div>
            <NewsletterForm labels={{ cta: t.newsCta, ok: t.newsOk, err: t.newsErr }} />
          </div>
        </div>
      </section>
    </>
  );
}
