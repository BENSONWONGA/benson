/**
 * app/shop/page.jsx — 商品列表（SSR + searchParams 过滤，SEO 友好的链接式筛选）
 */

import Link from "next/link";
import { cookies } from "next/headers";
import { listProducts } from "@/modules/catalog/service";
import { getCurrencyFromCookies } from "@/lib/currency";
import ProductCard from "@/components/ProductCard";

const CATEGORIES = ["All", "Loafers", "Sneakers", "Heels", "Sandals", "Boots", "Slippers"];
const WIDTHS = ["All", "Standard", "Wide"];
const HEELS = ["All", "Flat", "Low", "Mid"];

export const metadata = { title: "Shop all" };
export const dynamic = "force-dynamic";

function chipHref(params, key, value) {
  const sp = new URLSearchParams(params);
  if (value === "All") sp.delete(key);
  else sp.set(key, value);
  const qs = sp.toString();
  return "/shop" + (qs ? "?" + qs : "");
}

export default function ShopPage({ searchParams }) {
  const currency = getCurrencyFromCookies(cookies());
  const products = listProducts(searchParams);

  return (
    <>
      <div className="shop-head">
        <div className="eyebrow">The collection</div>
        <h1 style={{ fontSize: 40 }}>Every pair, fitted to you.</h1>
        <p className="lede" style={{ marginTop: 8 }}>
          {products.length} styles · every pair covered by the Fit Guarantee.
        </p>
        <div className="chip-row">
          {CATEGORIES.map((c) => (
            <Link key={c} className={"chip" + ((searchParams.category || "All") === c ? " active" : "")}
              href={chipHref(searchParams, "category", c)}>{c}</Link>
          ))}
        </div>
        <div className="chip-row">
          {WIDTHS.map((w) => (
            <Link key={w} className={"chip" + ((searchParams.width || "All") === w ? " active" : "")}
              href={chipHref(searchParams, "width", w)}>{w}</Link>
          ))}
          {HEELS.map((h) => (
            <Link key={h} className={"chip" + ((searchParams.heel || "All") === h ? " active" : "")}
              href={chipHref(searchParams, "heel", h)}>{h} heel</Link>
          ))}
        </div>
      </div>
      <div className="container" style={{ paddingBottom: 64 }}>
        {products.length ? (
          <div className="product-grid">
            {products.map((p) => <ProductCard key={p.id} product={p} currency={currency} />)}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: 64, color: "var(--text-sub)" }}>
            Nothing matches those filters. <Link href="/shop" style={{ color: "var(--fit)", fontWeight: 700 }}>Clear filters</Link>
          </div>
        )}
      </div>
    </>
  );
}
