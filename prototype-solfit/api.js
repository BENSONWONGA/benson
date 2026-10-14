/* ============================================================
   api.js — API stub 层（形状 = 未来真实 API，延迟 + TODO 标注）
   后端接入时只需替换实现，签名/时延/加载态保持一致
   ============================================================ */

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

window.API = {
  /** 商品列表
   * GET /api/products?category=&width=&heel=&sort=
   * resp: { code, data: Product[], total }
   */
  async fetchProducts({ category, width, heel, sort } = {}) {
    await delay(280);
    let list = DB.products.slice();
    if (category && category !== "All") list = list.filter((p) => p.category === category);
    if (width && width !== "All") list = list.filter((p) => p.widths.includes(width));
    if (heel && heel !== "All") list = list.filter((p) => p.heel === heel);
    switch (sort) {
      case "price-asc": list.sort((a, b) => a.price - b.price); break;
      case "price-desc": list.sort((a, b) => b.price - a.price); break;
      case "rating": list.sort((a, b) => b.rating - a.rating); break;
      default: break; // Featured（mock 原始顺序）
    }
    // TODO: replace with fetch('/api/products?...') — keep the shape identical
    return { code: 0, data: list, total: list.length };
  },

  /** 商品详情
   * GET /api/products/:id → { code, data: Product }
   */
  async fetchProduct(id) {
    await delay(160);
    const p = DB.products.find((x) => x.id === Number(id));
    // TODO: replace with fetch('/api/products/' + id)
    return p ? { code: 0, data: p } : { code: 404, data: null };
  },

  /** AI 尺码推荐（V1 规则版逻辑，Phase 2 换 CV + ML 模型）
   * POST /api/ai/size-recommendation
   * req:  { usualSize, usualBrand, widthFeel, footNotes[] }
   * resp: { code, data: { size, width, confidence, reason, measurements } }
   */
  async submitSizeProfile(profile) {
    await delay(1400); // 模拟"AI 分析"，让扫描动画可见
    const brandAdj = { Nike: 0, Adidas: -0.5, "New Balance": 0, Vionic: 0, Other: 0 }[profile.usualBrand] || 0;
    const widthFeelAdj = { Narrow: -0.5, Standard: 0, Wide: 0.5 }[profile.widthFeel] || 0;
    const noteAdj = (profile.footNotes || []).includes("High arch") ? 0.5 : 0;

    const base = parseFloat(profile.usualSize);
    let size = base + brandAdj + widthFeelAdj * 0.5 + noteAdj;
    size = Math.round(size * 2) / 2; // 半码粒度
    if (size < 35) size = 35;
    if (size > 42.5) size = 42.5;

    const widthRec = profile.widthFeel === "Wide" ? "Wide" : "Standard";
    const confidence = 88 + Math.round(Math.random() * 8); // 88–96%
    const measurements = {
      length: (21.8 + (size - 35) * 0.58 + Math.random() * 0.2).toFixed(1), // cm（演示推算）
      width: (widthRec === "Wide" ? 10.2 : 8.9 + Math.random() * 0.3).toFixed(1),
      instep: profile.footNotes && profile.footNotes.includes("High arch") ? "High" : "Normal",
    };
    const reason =
      widthRec === "Wide"
        ? `Based on your ${profile.usualBrand} ${profile.usualSize} history and a wider forefoot pattern, we suggest ${widthRec} width — the W-last gives your toes 8mm more room than your usual brand.`
        : `Your ${profile.usualBrand} ${profile.usualSize} history maps cleanly onto our lasts. We recommend staying at your usual size in ${widthRec} width.`;
    // TODO: replace with fetch('/api/ai/size-recommendation', { method:'POST', body: profile })
    return {
      code: 0,
      data: { size: size.toFixed(1).replace(/\.0$/, ""), width: widthRec, confidence, measurements, reason },
    };
  },

  /** AI 导购 Stylist（关键词匹配演示；真实实现为 LLM+RAG+Function Calling）
   * POST /api/ai/stylist { text } → { code, data: { reply, products[] } }
   */
  async askStylist(text) {
    await delay(700); // 模拟推理延迟，让 typing 指示可见
    const t = text.toLowerCase();
    const hit = DB.chatIntents.find((intent) => intent.keywords.some((k) => t.includes(k.toLowerCase())));
    const productIds = hit ? hit.productIds : [1, 2];
    const products = DB.products.filter((p) => productIds.includes(p.id));
    // TODO: replace with LLM + RAG pipeline — 商品事实必须来自结构化检索，禁止模型编造
    return {
      code: 0,
      data: { reply: hit ? hit.reply : DB.chatFallback, products },
    };
  },

  /* ---------- 购物车（localStorage 持久化，形状 = 未来 /api/cart） ---------- */
  getCart() {
    try { return JSON.parse(localStorage.getItem("solfit_cart") || "[]"); }
    catch (e) { return []; }
  },
  saveCart(items) {
    localStorage.setItem("solfit_cart", JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("solfit:cart-changed"));
  },
  addToCart(productId, size, qty, width) {
    const items = this.getCart();
    const key = (i) => `${i.productId}-${i.size}-${i.width || "Standard"}`;
    const existing = items.find((i) => key(i) === `${productId}-${size}-${width}`);
    if (existing) existing.qty += qty;
    else items.push({ productId: Number(productId), size, qty, width: width || "Standard" });
    this.saveCart(items);
    return items;
  },
  updateQty(index, qty) {
    const items = this.getCart();
    if (!items[index]) return items;
    items[index].qty = Math.max(1, qty);
    this.saveCart(items);
    return items;
  },
  removeItem(index) {
    const items = this.getCart().filter((_, i) => i !== index);
    this.saveCart(items);
    return items;
  },

  /** 尺码档案（localStorage，Phase 3 迁移为账户级数据） */
  getFitProfile() {
    try { return JSON.parse(localStorage.getItem("solfit_fit_profile") || "null"); }
    catch (e) { return null; }
  },
  saveFitProfile(profile) {
    localStorage.setItem("solfit_fit_profile", JSON.stringify(profile));
    window.dispatchEvent(new CustomEvent("solfit:fit-changed"));
  },
};
