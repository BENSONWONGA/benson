/**
 * ai/stylist/tools.js — Function Calling 工具定义（AI 导购防幻觉的关键）
 * 铁律：LLM 只做意图理解与语言组织，商品事实必须来自这些工具的结构化返回。
 */

import { searchProducts, getProduct } from "@/modules/catalog/service";
import { listProducts } from "@/modules/catalog/service";

/** OpenAI 兼容的工具 schema —— 任何兼容端点可直接使用 */
export const STYLIST_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_products",
      description: "Search the SOLFIT catalog. Use for ANY product question — never answer product facts from memory.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "Free-text keyword, e.g. 'wedding', 'comfortable'" },
          category: { type: "string", enum: ["Loafers", "Sneakers", "Heels", "Sandals", "Boots", "Slippers"] },
          heel: { type: "string", enum: ["Flat", "Low", "Mid"], description: "Heel height class" },
          width: { type: "string", enum: ["Standard", "Wide"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product_details",
      description: "Get price, sizes, stock, fit notes for one product by id. Use before recommending to confirm availability.",
      parameters: {
        type: "object",
        properties: { id: { type: "number" } },
        required: ["id"],
      },
    },
  },
];

/** 工具执行器 —— LLM 的 tool_call 在这里落到结构化数据 */
export async function executeStylistTool(name, args) {
  switch (name) {
    case "search_products": {
      const products = searchProducts({ ...args, max: 4 });
      return products.map((p) => ({
        id: p.id, name: p.name, price: p.price, category: p.category,
        heel: p.heel, widths: p.widths, rating: p.rating, image: p.image,
      }));
    }
    case "get_product_details": {
      const p = await getProduct(args.id);
      if (!p) return { error: "not found" };
      const { id, name, price, category, heel, widths, sizes, oos, badge, desc, image, fitStats } = p;
      return { id, name, price, category, heel, widths, sizes, oos, badge, desc, image, fitStats };
    }
    default:
      return { error: "unknown tool" };
  }
}

/** 未配置 LLM 时的关键词兜底（保证骨架开箱可跑） */
export async function keywordFallback(message) {
  const t = String(message).toLowerCase();
  const rules = [
    { k: ["wedding", "bride"], products: [3, 8], reply: "For weddings I recommend keeping the heel under 45mm so you survive the dancing. My picks:" },
    { k: ["wide", "bunion", "comfort", "commute"], products: [7, 4], reply: "These are built on wide-specific lasts (not stretched patterns), ideal for all-day wear:" },
    { k: ["sneaker", "white", "casual"], products: [2, 6], reply: "Sneakers — our home turf:" },
    { k: ["loafer", "office", "work"], products: [1, 7], reply: "For office-grade loafers:" },
    { k: ["boot", "rain", "winter"], products: [9], reply: "The Voyage Chelsea handles drizzle and cobblestones:" },
    { k: ["size", "fit", "recommend"], products: [1, 2], reply: "I can nail your size in under a minute — open the AI Size Finder on any product page:" },
  ];
  const hit = rules.find((r) => r.k.some((k) => t.includes(k)));
  if (hit) {
    const products = (await Promise.all(hit.products.map(getProduct))).filter(Boolean);
    return { reply: hit.reply, products };
  }
  return { reply: "I can help with categories (heels, loafers, sneakers, boots…), fit questions, or sizing. What's the occasion?", products: listProducts().slice(0, 2) };
}
