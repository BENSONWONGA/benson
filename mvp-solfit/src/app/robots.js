/**
 * app/robots.js — 爬虫策略：前台可索引；后台/账户/API 全禁。
 * sitemap 全量提交（unlisted/unpublished 已在源头排除）。
 */

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://solfit.example";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/account", "/checkout", "/cart", "/api/"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
