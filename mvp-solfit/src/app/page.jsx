/**
 * app/page.jsx — 首页（SSR：SEO 是独立站命脉，见方案文档 §6.2）
 * 商品数据服务端直出，AI 推荐走 /api/ai/recommendations（冷启动规则）
 */

import Link from "next/link";
import { cookies } from "next/headers";
import { listProducts } from "@/modules/catalog/service";
import { coldStartRecommend } from "@/ai/recommender";
import { getCurrencyFromCookies } from "@/lib/currency";
import ProductCard from "@/components/ProductCard";

export const dynamic = "force-dynamic"; // 货币偏好按会话渲染（SEO 策略见方案 §6.2：ISR + 边缘个性化）

export default function HomePage() {
  const currency = getCurrencyFromCookies(cookies());
  const featured = listProducts({ sort: "rating" }).slice(0, 4);
  const recommended = coldStartRecommend({ max: 4 }); // Phase 2 换召回+排序

  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">AI-fitted footwear</div>
          <h1>The pair that fits. Guaranteed.</h1>
          <p className="lede">
            63% of people wear the wrong shoe size. Our AI reads your feet in 60 seconds and matches
            them to our lasts — with a free-exchange guarantee behind every pair.
          </p>
          <div className="hero-cta">
            <Link className="btn btn-fit" href="/product/1">Find my size — 60 sec</Link>
            <Link className="btn btn-outline" href="/shop">Shop the collection</Link>
          </div>
        </div>
        <div className="hero-photo">
          <img
            src="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=elegant%20young%20woman%20walking%20on%20sunlit%20european%20street%20wearing%20cream%20minimalist%20sneakers%2C%20editorial%20fashion%20photography%2C%20warm%20morning%20light&image_size=portrait_4_3"
            alt="Woman walking in cream SOLFIT sneakers"
          />
        </div>
      </section>

      <section className="section" id="fit-science">
        <div className="container">
          <div className="eyebrow">AI recommendations</div>
          <h2 style={{ marginBottom: 24 }}>Fitted for you this week</h2>
          <div className="product-grid">
            {recommended.map((p) => <ProductCard key={p.id} product={p} currency={currency} />)}
          </div>
        </div>
      </section>

      <section className="section" style={{ background: "#fff", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="container">
          <div className="eyebrow">Top rated</div>
          <h2 style={{ marginBottom: 24 }}>Most fitted, most loved</h2>
          <div className="product-grid">
            {featured.map((p) => <ProductCard key={p.id} product={p} currency={currency} />)}
          </div>
        </div>
      </section>
    </>
  );
}
