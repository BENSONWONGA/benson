/**
 * modules/content — SEO 内容域（模块化单体 · Phase 20）
 *
 * 独立站的自然流量命脉：博客/选购指南承载长尾搜索词（"wide feet shoes"、
 * "eu to us size chart"…），内链到商品筛选页形成 SEO 闭环。文章 SSR 全
 * 文渲染 + Article JSON-LD（富摘要）；sitemap.ts 消费本域 published 列表。
 *
 * 骨架期：种子文章 + 商家后台 Content tab（新建/编辑/发布下线）；
 * 正文是纯文本分段（不引 markdown 库 —— 自研边界零依赖铁律）。
 * 照片/正文不落事件管道（post_published 只审计 slug/布尔）。
 */

import { store, trackEvent } from "@/lib/db";

const slugify = (title) =>
  String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "post-" + Date.now();

/** 种子内容：三篇高搜索意图指南（宽脚/尺码换算/皮革保养 —— 贴合站点主题） */
const SEED_POSTS = [
  {
    slug: "wide-feet-shoe-guide",
    title: "The Honest Guide to Shoes for Wide Feet",
    excerpt: "Why 'true to size' lies to wide feet, how to read last shapes, and the three measurements that actually matter.",
    tags: ["fit guide", "wide feet"],
    body: [
      "Most shoes are built on a standard D-width last, which is why 'true to size' advice fails wide feet. The fix is not sizing up — a longer shoe gives you length you do not need and a heel that slips.",
      "What actually matters is the last — the foot-shaped form the shoe is built on. Rounded lasts with forgiving toe boxes (like our W2) fit wider forefeet without going half a size up. Knit uppers (W3) adapt as your feet swell through the day.",
      "Three measurements beat guessing: foot length in cm, forefoot width, and instep height. Measure at the end of the day, standing, with your weight on the foot. Add 0.5–1.0 cm of wiggle room for toes.",
      "When shopping, filter by wide-fit models first and read fit feedback from verified buyers — our product pages show what percentage of buyers found each model true to size.",
    ].join("\n\n"),
    cover: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=close%20up%20of%20comfortable%20wide%20leather%20shoes%20on%20wooden%20floor%20soft%20morning%20light%20minimal%20editorial%20style&image_size=landscape_16_9",
  },
  {
    slug: "eu-to-us-size-conversion",
    title: "EU to US Shoe Size: The Conversion Chart That Doesn't Lie",
    excerpt: "Why there is no single conversion chart, and how to translate EU sizes to US sizing by foot length instead of guesswork.",
    tags: ["size chart", "conversion"],
    body: [
      "Every brand converts EU sizes differently — a EU 41 can be a US 9 or 9.5 depending on the last. The only honest conversion is through foot length: measure your foot in centimeters and match it to the brand's own chart.",
      "As a rule of thumb, EU sizes step by 6.7 mm per size (each size ≈ 0.667 cm). If you know one EU size that fits from a brand, the same EU size is the safest bet across models on the same last.",
      "For US sizing, women's and men's charts differ by 1.5 — a women's US 10.5 is a men's US 9. UK sizing is one below US men's.",
      "Skip the guesswork entirely: our AI Size Finder converts your foot measurements to the exact EU size for each last shape — including whether to size down on generous lasts like W2.",
    ].join("\n\n"),
    cover: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=minimal%20flat%20lay%20of%20brown%20measuring%20tape%20and%20elegant%20shoes%20on%20beige%20paper%20background%20clean%20editorial&image_size=landscape_16_9",
  },
  {
    slug: "break-in-leather-shoes",
    title: "How to Break In Leather Shoes Without the Blisters",
    excerpt: "The 5-day rotation, why thick socks are wrong, and what cork footbeds do for the first 40 km.",
    tags: ["care", "leather"],
    body: [
      "Leather adapts to pressure — that is the good news and the bad news. The first week sets the shoe's memory, so rotate short wears: one hour day one, two hours day two, building to a full day by day five.",
      "Skip the thick-sock trick for dress shoes: it overstretches the instep and leaves the shoe loose when you wear normal socks. Wear the weight of sock you will actually use.",
      "Cork footbeds (like the 4mm layer in our loafers) mold to your arch within the first 40 km — a personalized insole without the custom price. Let them do the work.",
      "Heel slip in the first week is normal if it is under 1 cm. More than that, the last is wrong for your foot — no amount of breaking in will fix length.",
    ].join("\n\n"),
    cover: "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=artisan%20hands%20applying%20cream%20to%20tan%20leather%20oxford%20shoe%20workshop%20warm%20light&image_size=landscape_16_9",
  },
];

function ensureSeed() {
  const m = store("posts");
  if (m.size) return;
  for (const p of SEED_POSTS) {
    m.set(p.slug, {
      ...p,
      author: "SOLFIT Fit Team",
      published: true,
      createdAt: new Date(Date.now() - m.size * 86400000 * 3).toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}

/** 前台列表（published only）；includeUnpublished 供商家视图 */
export function listPosts({ includeUnpublished } = {}) {
  ensureSeed();
  let list = [...store("posts").values()];
  if (!includeUnpublished) list = list.filter((p) => p.published);
  return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getPost(slug) {
  ensureSeed();
  return store("posts").get(String(slug)) || null;
}

/** 商家建文章（Content tab）；slug 冲突自动加后缀而非拒绝（写作流不阻断） */
export function createPost({ title, excerpt, body, tags, cover } = {}) {
  ensureSeed();
  const t = String(title || "").trim();
  const text = String(body || "").trim();
  if (!t || !text) throw new Error("MISSING_FIELDS");

  let slug = slugify(t);
  if (store("posts").has(slug)) slug = `${slug}-${Date.now().toString(36)}`;

  const post = {
    slug,
    title: t,
    excerpt: String(excerpt || "").trim().slice(0, 200) || text.slice(0, 160),
    body: text,
    tags: String(tags || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6),
    cover: String(cover || "").trim(),
    author: "SOLFIT Fit Team",
    published: true, // 新文章默认发布（SEO 内容有实效性；下线用 setPublished）
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store("posts").set(slug, post);
  trackEvent("post_published", { slug, published: true });
  return post;
}

/** 编辑（标题/摘要/正文/标签/封面） */
export function updatePost(slug, patch = {}) {
  ensureSeed();
  const p = store("posts").get(String(slug));
  if (!p) throw new Error("POST_NOT_FOUND");
  if (patch.title !== undefined) {
    const t = String(patch.title).trim();
    if (!t) throw new Error("INVALID_TITLE");
    p.title = t;
  }
  if (patch.excerpt !== undefined) p.excerpt = String(patch.excerpt).trim().slice(0, 200);
  if (patch.body !== undefined) {
    const text = String(patch.body).trim();
    if (!text) throw new Error("INVALID_BODY");
    p.body = text;
  }
  if (patch.tags !== undefined) p.tags = String(patch.tags).split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6);
  if (patch.cover !== undefined) p.cover = String(patch.cover).trim();
  p.updatedAt = new Date().toISOString();
  store("posts").set(p.slug, p);
  return p;
}

/** 发布/下线（下线的文章退出 sitemap 与前台） */
export function setPublished(slug, published) {
  ensureSeed();
  const p = store("posts").get(String(slug));
  if (!p) throw new Error("POST_NOT_FOUND");
  p.published = !!published;
  p.updatedAt = new Date().toISOString();
  store("posts").set(p.slug, p);
  trackEvent("post_published", { slug: p.slug, published: p.published });
  return p;
}

/** 商家视图摘要（Content tab 列表） */
export function adminListPosts() {
  return listPosts({ includeUnpublished: true }).map((p) => ({
    slug: p.slug, title: p.title, excerpt: p.excerpt, tags: p.tags,
    cover: p.cover, published: p.published,
    wordCount: p.body.split(/\s+/).length,
    createdAt: p.createdAt, updatedAt: p.updatedAt,
  }));
}
