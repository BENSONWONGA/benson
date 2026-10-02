/**
 * app/sitemap.js — 站点地图（静态页 + 在售商品 + 发布中文章）
 * 商品 unlisted / 文章下线即退出 —— 与前台可见性同源，防索引库出现死链。
 */

import { listProducts } from "@/modules/catalog/service";
import { listPosts } from "@/modules/content/service";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://solfit.example";

export default function sitemap() {
  const now = new Date();

  const staticPages = [
    { url: `${BASE}/`, priority: 1, changeFrequency: "daily" },
    { url: `${BASE}/shop`, priority: 0.9, changeFrequency: "daily" },
    { url: `${BASE}/blog`, priority: 0.8, changeFrequency: "weekly" },
  ];

  const products = listProducts().map((p) => ({
    url: `${BASE}/product/${p.id}`,
    lastModified: p.updatedAt || now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const posts = listPosts().map((p) => ({
    url: `${BASE}/blog/${p.slug}`,
    lastModified: p.updatedAt || now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticPages, ...products, ...posts];
}
