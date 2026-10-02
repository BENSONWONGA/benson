/* ============================================================
   app.js — 共享交互层：导航/购物车/聊天/尺码向导/页面渲染
   页面差异通过 body[data-page] 分发，禁止每页重写行为
   ============================================================ */

/* ---------- Lucide 内联图标（离线可用，禁 emoji） ---------- */
const ICONS = {
  search: '<path d="M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z"/><path d="m21 21-4.3-4.3"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  footprints: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2Z"/><path d="M16 17h4"/><path d="M4 13h4"/>',
  sparkles: '<path d="M12 3l1.9 5.7a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3Z"/>',
  message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18h-5"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35a1 1 0 0 0-.78-.38H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  refresh: '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
};

function icon(name, size, sw) {
  const s = size || 20;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="' + (sw || 1.75) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (ICONS[name] || "") + "</svg>";
}

/* ---------- helpers ---------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const money = (n) => "$" + n;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function starsHtml(rating) {
  let out = '<span class="stars" role="img" aria-label="' + rating + ' out of 5 stars">';
  for (let i = 1; i <= 5; i++) out += icon("star", 13).replace("<svg ", '<svg class="' + (i <= Math.round(rating) ? "" : "off") + '" ');
  return out + "</span>";
}

/* ---------- product card ---------- */
function productCardHtml(p, extraClass) {
  const badges = [];
  if (p.badge) badges.push('<span class="tag tag-dark">' + esc(p.badge) + "</span>");
  if (p.compareAt) badges.push('<span class="tag tag-sale">-' + Math.round((1 - p.price / p.compareAt) * 100) + "%</span>");
  if (p.widths.includes("Wide")) badges.push('<span class="tag tag-ai">' + icon("check", 11) + "Wide last</span>");
  return (
    '<a class="product-card ' + (extraClass || "") + '" href="product.html?id=' + p.id + '">' +
      '<div class="thumb"><img src="' + DB.imageFor(p) + '" alt="' + esc(p.name) + '" loading="lazy">' +
      (badges.length ? '<div class="card-badges">' + badges.join("") + "</div>" : "") + "</div>" +
      '<div class="info">' +
        '<span class="name">' + esc(p.name) + "</span>" +
        '<span class="meta">' + esc(p.category) + " · " + esc(p.heel) + " heel</span>" +
        '<div class="rating-line">' + starsHtml(p.rating) + "<span>" + p.rating + " (" + p.reviewsCount.toLocaleString() + ")</span></div>" +
        '<div class="price-row"><span class="price">' + money(p.price) + "</span>" +
        (p.compareAt ? '<span class="price-strike">' + money(p.compareAt) + "</span>" : "") + "</div>" +
        '<div class="card-cta"><span class="btn btn-outline btn-sm btn-block" style="pointer-events:none">View &amp; pick size</span></div>' +
      "</div>" +
    "</a>"
  );
}

/* ============================================================
   1. 导航（active 由 body[data-page] 驱动 — 唯一机制）
   ============================================================ */
function initNav() {
  const page = document.body.dataset.page;
  $$(".main-nav a[data-nav], .mobile-nav a[data-nav]").forEach((a) => {
    if (a.dataset.nav === page) a.classList.add("active");
  });
  const toggle = $("#navToggle"), mobileNav = $("#mobileNav");
  if (toggle && mobileNav) {
    toggle.addEventListener("click", () => mobileNav.classList.toggle("open"));
    mobileNav.addEventListener("click", () => mobileNav.classList.remove("open"));
  }
  // header 图标行为（演示桩）
  $("#searchBtn") && $("#searchBtn").addEventListener("click", () => {
    toast("Search by vibe instead — ask the Fit Stylist", icon("message", 14));
    openChat();
  });
  $("#accountBtn") && $("#accountBtn").addEventListener("click", () => {
    toast("Accounts are stubbed in this demo build");
  });
}

/* ============================================================
   2. Toast
   ============================================================ */
function toast(msg, ic) {
  const wrap = $("#toastWrap");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = (ic || icon("checkCircle", 14)) + "<span>" + esc(msg) + "</span>";
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 2700);
}

/* ============================================================
   3. 购物车抽屉
   ============================================================ */
function cartCount(items) {
  return items.reduce((s, i) => s + i.qty, 0);
}

function renderCart() {
  const items = API.getCart();
  const countEl = $("#cartCount");
  countEl && (countEl.textContent = cartCount(items));
  countEl && (countEl.style.display = items.length ? "flex" : "none");

  const listEl = $("#cartItems");
  const emptyEl = $("#cartEmpty");
  const footEl = $("#cartFoot");
  if (!listEl) return;
  listEl.innerHTML = "";
  emptyEl.style.display = items.length ? "none" : "block";
  footEl.style.display = items.length ? "block" : "none";

  items.forEach((item, idx) => {
    const p = DB.products.find((x) => x.id === item.productId) || { name: "Item", price: 0 };
    const el = document.createElement("div");
    el.className = "cart-item";
    el.innerHTML =
      '<img src="' + DB.imageFor(p) + '" alt="">' +
      '<div><div class="n">' + esc(p.name) + "</div>" +
      '<div class="m">EU ' + esc(item.size) + " · " + esc(item.width) + "</div>" +
      '<div class="qty"><button type="button" data-cart-dec="' + idx + '" aria-label="Decrease">' + icon("minus", 14) + "</button>" +
      "<span>" + item.qty + "</span>" +
      '<button type="button" data-cart-inc="' + idx + '" aria-label="Increase">' + icon("plus", 14) + "</button></div></div>" +
      '<div class="right"><span class="p">' + money(p.price * item.qty) + "</span>" +
      '<button class="remove-btn" type="button" data-cart-remove="' + idx + '">' + icon("trash", 12) + "Remove</button></div>";
    listEl.appendChild(el);
  });

  const subtotal = items.reduce((s, i) => s + i.qty * (DB.products.find((x) => x.id === i.productId) || { price: 0 }).price, 0);
  const subtotalEl = $("#cartSubtotal");
  subtotalEl && (subtotalEl.textContent = money(subtotal));
  const shipGoal = 120;
  const barEl = $("#shipBar");
  const labelEl = $("#shipLabel");
  if (barEl && labelEl) {
    const pct = Math.min(100, Math.round((subtotal / shipGoal) * 100));
    barEl.style.width = pct + "%";
    labelEl.innerHTML = subtotal >= shipGoal
      ? icon("checkCircle", 13) + " Free express shipping unlocked"
      : "You're " + money(shipGoal - subtotal) + " away from free express shipping";
  }
}

function openCart() {
  $("#cartDrawer").classList.add("open");
  $("#cartOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeCart() {
  $("#cartDrawer").classList.remove("open");
  $("#cartOverlay").classList.remove("open");
  document.body.style.overflow = "";
}

function initCart() {
  $("#cartBtn") && $("#cartBtn").addEventListener("click", openCart);
  $("#cartClose") && $("#cartClose").addEventListener("click", closeCart);
  $("#cartOverlay") && $("#cartOverlay").addEventListener("click", closeCart);
  $("#checkoutBtn") && $("#checkoutBtn").addEventListener("click", () => {
    toast("Checkout is stubbed — this demo stops at the cart", icon("x", 14));
  });
  // 事件委托：数量增减 / 删除
  $("#cartItems") && $("#cartItems").addEventListener("click", (e) => {
    const inc = e.target.closest("[data-cart-inc]");
    const dec = e.target.closest("[data-cart-dec]");
    const rem = e.target.closest("[data-cart-remove]");
    if (inc) API.updateQty(Number(inc.dataset.cartInc), API.getCart()[Number(inc.dataset.cartInc)].qty + 1);
    if (dec) API.updateQty(Number(dec.dataset.cartDec), Math.max(1, API.getCart()[Number(dec.dataset.cartDec)].qty - 1));
    if (rem) API.removeItem(Number(rem.dataset.cartRemove));
    if (inc || dec || rem) renderCart();
  });
  // footer 订阅表单（shell 一致，三页通用）
  const footerForm = $("#footerNewsForm");
  footerForm && footerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#footerNewsInput");
    if (!input.value.includes("@")) { toast("Enter a valid email to subscribe", icon("x", 14)); return; }
    input.value = "";
    toast("Subscribed — see you in your inbox", icon("checkCircle", 14));
  });
  window.addEventListener("solfit:cart-changed", renderCart);
  renderCart();
}

/* ============================================================
   4. Fit Stylist 聊天（AI 导购演示 — 关键词匹配桩）
   ============================================================ */
let chatState = { open: false, greeted: false, busy: false };

function addMsg(cls, html) {
  const log = $("#chatLog");
  const el = document.createElement("div");
  el.className = "msg " + cls;
  el.innerHTML = html;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

function addRecCards(products) {
  const log = $("#chatLog");
  const wrap = document.createElement("div");
  wrap.className = "chat-rec";
  products.forEach((p) => {
    const card = document.createElement("div");
    card.className = "chat-rec-card";
    card.innerHTML =
      '<img src="' + DB.imageFor(p) + '" alt="">' +
      "<div><div class=\"n\">" + esc(p.name) + '</div><div class="p">' + money(p.price) + " · " + esc(p.category) + "</div></div>" +
      '<a class="go" href="product.html?id=' + p.id + '">View ' + icon("chevronRight", 12) + "</a>";
    wrap.appendChild(card);
  });
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
}

async function stylistSay(text) {
  chatState.busy = true;
  const typing = addMsg("bot", '<span class="typing"><i></i><i></i><i></i></span>');
  const res = await API.askStylist(text);
  typing.remove();
  addMsg("bot", esc(res.data.reply));
  addRecCards(res.data.products);
  chatState.busy = false;
}

async function sendChat(text) {
  const input = $("#chatInput");
  if (!text) text = input.value.trim();
  if (!text || chatState.busy) return;
  input.value = "";
  addMsg("user", esc(text));
  await stylistSay(text);
}

function openChat() {
  chatState.open = true;
  $("#chatPanel").classList.add("open");
  $("#chatFab").style.display = "none";
  if (!chatState.greeted) {
    chatState.greeted = true;
    addMsg("bot", "Hi, I'm your Fit Stylist. Tell me an occasion, a vibe, or a fit problem — I'll pull the right pairs and check sizing against your profile. (Demo: scripted intents, not a live model.)");
  }
}
function closeChat() {
  chatState.open = false;
  $("#chatPanel").classList.remove("open");
  $("#chatFab").style.display = "flex";
}

function initChat() {
  $("#chatFab").addEventListener("click", openChat);
  $("#chatClose").addEventListener("click", closeChat);
  $("#chatSend").addEventListener("click", () => sendChat());
  $("#chatInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });
  const chipsEl = $("#chatChips");
  DB.chatGreetings.forEach((g) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chat-chip";
    b.textContent = g.label;
    b.addEventListener("click", () => sendChat(g.text));
    chipsEl.appendChild(b);
  });
}

/* ============================================================
   5. AI Size Finder（PDP 三步向导）
   ============================================================ */
function initSizeFinder(product, callbacks) {
  const overlay = $("#finderOverlay");
  if (!overlay) return;
  const openBtn = $("#openFinder");
  const steps = [$$("#finderSteps .mstep")[0], $$("#finderSteps .mstep")[1], $$("#finderSteps .mstep")[2]];
  const panes = { form: $("#paneForm"), scan: $("#paneScan"), result: $("#paneResult") };
  let profile = null, resultData = null;

  function showPane(name) {
    Object.values(panes).forEach((p) => (p.style.display = "none"));
    panes[name].style.display = "block";
    steps.forEach((s, i) => {
      s.classList.toggle("done", (name === "form" && i === 0) || (name === "scan" && i <= 1) || name === "result");
    });
  }
  function open() {
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    showPane("form");
  }
  function close() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }
  openBtn.addEventListener("click", open);
  $("#finderClose").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { close(); closeCart(); closeChat(); }
  });

  $("#finderForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    profile = {
      usualSize: $("#fSize").value,
      usualBrand: $("#fBrand").value,
      widthFeel: $("input[name=widthFeel]:checked").value,
      footNotes: $$("input[name=footNotes]:checked").map((c) => c.value),
    };
    if (!profile.usualSize || !profile.usualBrand) { toast("Pick your usual size and brand first", icon("ruler", 14)); return; }
    showPane("scan");
    // 扫描动画 + 伪读数
    const bar = $("#scanBar");
    bar.style.width = "0%";
    setTimeout(() => (bar.style.width = "46%"), 100);
    setTimeout(() => (bar.style.width = "82%"), 900);
    const res = await API.submitSizeProfile(profile);
    resultData = res.data;
    $("#scanMsg").textContent = "Scan complete — 13 measurement points captured";
    bar.style.width = "100%";
    $("#resLen").textContent = resultData.measurements.length + " cm";
    $("#resWid").textContent = resultData.measurements.width + " cm";
    $("#resIns").textContent = resultData.measurements.instep;
    setTimeout(() => {
      $("#resSize").innerHTML = "EU " + esc(resultData.size) + ' <small>US ' + (resultData.size - 30.5).toFixed(1).replace(/\.0$/, "") + " · " + esc(resultData.width) + " width</small>";
      $("#resConfidence").innerHTML = icon("sparkles", 13) + " " + resultData.confidence + "% fit confidence";
      $("#resNote").textContent = resultData.reason;
      showPane("result");
    }, 500);
  });

  $("#resApply").addEventListener("click", () => {
    API.saveFitProfile({ ...profile, recommendation: resultData });
    close();
    callbacks && callbacks.onApply && callbacks.onApply(resultData);
    toast("Fit profile saved — your recommendation is preselected", icon("sparkles", 14));
  });
  $("#resRestart").addEventListener("click", () => showPane("form"));

  // 已有档案时，PDP 自动预选
  const saved = API.getFitProfile();
  if (saved && saved.recommendation) callbacks && callbacks.onApply && callbacks.onApply(saved.recommendation, { silent: true });
  return { open };
}

/* ============================================================
   6. 页面分发
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initCart();
  initChat();

  const page = document.body.dataset.page;

  /* ---------- Home ---------- */
  if (page === "home") {
    const featured = $("#featuredGrid");
    featured.innerHTML = [1, 2, 7, 3].map((id) => DB.products.find((p) => p.id === id))
      .map((p, i) => productCardHtml(p, "reveal")).join("");
    $("#heroImg").src = DB.heroImage;
    $("#scienceImg").src = DB.scienceImage;

    // 首页评价墙（3 条，取自 DB.reviews）
    $("#homeReviews").innerHTML = [0, 3, 4].map((i) => DB.reviews[i]).map((r) => {
      const prod = DB.products.find((p) => p.id === r.productId) || { name: "SOLFIT" };
      const initials = r.author.split(" ").map((w) => w[0]).join("");
      return (
        '<article class="review-card reveal">' +
          '<div class="head"><span class="avatar">' + esc(initials) + "</span>" +
          '<div><div class="who">' + esc(r.author) + "</div>" + starsHtml(r.rating) + "</div>" +
          '<span class="fit-tag">' + esc(r.fit) + "</span></div>" +
          "<p>" + esc(r.body) + "</p>" +
          '<div class="bought">Bought ' + esc(prod.name) + " · EU " + esc(r.size) + " · verified</div>" +
        "</article>"
      );
    }).join("");

    $("#newsForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#newsInput");
      if (!input.value.includes("@")) { toast("Enter a valid email to subscribe", icon("x", 14)); return; }
      input.value = "";
      toast("Subscribed — welcome to the fit club", icon("checkCircle", 14));
    });
    $("#footerNewsForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#footerNewsInput");
      if (!input.value.includes("@")) { toast("Enter a valid email to subscribe", icon("x", 14)); return; }
      input.value = "";
      toast("Subscribed — see you in your inbox", icon("checkCircle", 14));
    });
    $("#homeFinderCta").addEventListener("click", (e) => {
      e.preventDefault();
      toast("Size Finder lives on product pages — opening our bestseller", icon("sparkles", 14));
      setTimeout(() => (window.location.href = "product.html?id=1&finder=1"), 700);
    });
  }

  /* ---------- Shop ---------- */
  if (page === "shop") {
    const params = new URLSearchParams(location.search);
    const state = {
      category: params.get("category") || "All",
      width: params.get("width") || "All",
      heel: params.get("heel") || "All",
      sort: params.get("sort") || "featured",
    };
    function syncChips() {
      $$(".chip[data-filter-category]").forEach((c) => c.classList.toggle("active", c.dataset.filterCategory === state.category));
      $$(".chip[data-filter-width]").forEach((c) => c.classList.toggle("active", c.dataset.filterWidth === state.width));
      $$(".chip[data-filter-heel]").forEach((c) => c.classList.toggle("active", c.dataset.filterHeel === state.heel));
      $("#sortSelect").value = state.sort;
    }
    async function render() {
      syncChips();
      const grid = $("#shopGrid");
      grid.innerHTML = '<div class="skeleton" style="height:320px"></div><div class="skeleton" style="height:320px"></div><div class="skeleton" style="height:320px">';
      const res = await API.fetchProducts(state);
      grid.innerHTML = "";
      $("#shopCount").textContent = res.total + (res.total === 1 ? " style" : " styles");
      if (!res.total) {
        grid.innerHTML = '<div class="empty-state"><div class="ic">' + icon("footprints", 34) + "</div>" +
          "<p>Nothing matches those filters — but your size probably exists in another family.</p>" +
          '<button class="btn btn-primary btn-sm" type="button" id="clearFilters">Clear filters</button></div>';
        $("#clearFilters").addEventListener("click", () => {
          Object.assign(state, { category: "All", width: "All", heel: "All" });
          render();
        });
        return;
      }
      res.data.forEach((p) => grid.insertAdjacentHTML("beforeend", productCardHtml(p, "reveal")));
    }
    document.addEventListener("click", (e) => {
      const cat = e.target.closest("[data-filter-category]");
      const wid = e.target.closest("[data-filter-width]");
      const heel = e.target.closest("[data-filter-heel]");
      if (cat) { state.category = cat.dataset.filterCategory; render(); }
      if (wid) { state.width = wid.dataset.filterWidth; render(); }
      if (heel) { state.heel = heel.dataset.filterHeel; render(); }
    });
    $("#sortSelect").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
    render();
  }

  /* ---------- PDP ---------- */
  if (page === "product") {
    const params = new URLSearchParams(location.search);
    const id = Number(params.get("id")) || 1;
    const p = DB.products.find((x) => x.id === id) || DB.products[0];

    // 基础信息
    document.title = p.name + " — SOLFIT";
    $(".breadcrumb-name").textContent = p.name;
    $("#pdpName").textContent = p.name;
    $("#pdpMeta").textContent = p.category + " · " + p.heel + " heel · " + p.widths.join(" / ") + " width";
    $("#pdpRating").innerHTML = starsHtml(p.rating) + "<span>" + p.rating + " · " + p.reviewsCount.toLocaleString() + " verified reviews</span>";
    $("#pdpPrice").innerHTML = money(p.price) + (p.compareAt ? ' <span class="price-strike">' + money(p.compareAt) + "</span>" : "");
    $("#pdpDesc").textContent = p.desc;
    $("#pdpNote").textContent = p.aiFitNote;
    $("#pdpBadge").innerHTML = p.badge ? '<span class="tag tag-dark">' + esc(p.badge) + "</span>" : "";
    $("#pdpFeatures").innerHTML = p.features.map((f) => "<li>" + icon("check", 13) + esc(f) + "</li>").join("");

    // 图集（运行时生成 3 个视角）
    const shots = [
      DB.imageFor(p),
      img2(p.prompt + ", side profile view"),
      img2(p.prompt + ", top-down flat view"),
    ];
    function img2(extra) { return IMG_API + "?prompt=" + encodeURIComponent(extra) + "&image_size=square"; }
    $("#pdpMainImg").src = shots[0];
    $("#pdpMainImg").alt = p.name;
    $("#pdpThumbs").innerHTML = shots
      .map((src, i) => '<img src="' + src + '" class="' + (i === 0 ? "active" : "") + '" alt="' + esc(p.name) + ' view ' + (i + 1) + '" data-shot="' + i + '">')
      .join("");
    $("#pdpThumbs").addEventListener("click", (e) => {
      const t = e.target.closest("[data-shot]");
      if (!t) return;
      $("#pdpMainImg").src = shots[Number(t.dataset.shot)];
      $$("#pdpThumbs img").forEach((im) => im.classList.toggle("active", im === t));
    });

    // 宽窄选项
    const widthRow = $("#widthRow");
    widthRow.innerHTML = p.widths
      .map((w, i) => '<label class="radio-pill"><input type="radio" name="widthOpt" value="' + w + '" ' + (i === 0 ? "checked" : "") + '><span>' + w + "</span></label>")
      .join("");

    // 尺码格（AI 推荐 = 最近可用码标记 + apply 后高亮）
    function renderSizes(aiSize) {
      const grid = $("#sizeGrid");
      let nearest = null;
      if (aiSize) {
        const target = parseFloat(aiSize.size);
        const inStock = p.sizes.filter((s) => !p.oos.includes(s));
        nearest = inStock.reduce((best, s) =>
          best === null || Math.abs(parseFloat(s) - target) < Math.abs(parseFloat(best) - target) ? s : best, null);
      }
      grid.innerHTML = p.sizes
        .map((s) => {
          const oos = p.oos.includes(s);
          const isAi = aiSize && s === nearest;
          return '<button type="button" class="size-cell ' + (oos ? "oos" : "") + " " + (isAi ? "ai-pick" : "") +
            '" data-size="' + s + '" ' + (oos ? "disabled" : "") + ">EU " + s + "</button>";
        })
        .join("");
      const note = $("#aiSizeNote");
      if (aiSize) {
        note.style.display = "block";
        const exact = nearest !== null && Math.abs(parseFloat(nearest) - parseFloat(aiSize.size)) < 0.26;
        note.innerHTML = icon("sparkles", 13) + " Your fit profile suggests EU " + esc(aiSize.size) + " (" + esc(aiSize.width) + " width)" +
          (exact ? " — marked above." : ". This last runs in full sizes only, so EU " + esc(nearest || "–") + " is your closest fit.");
      } else {
        note.style.display = "none";
      }
    }
    renderSizes(null);

    let selectedSize = null;
    $("#sizeGrid").addEventListener("click", (e) => {
      const cell = e.target.closest(".size-cell:not(.oos)");
      if (!cell) return;
      $$("#sizeGrid .size-cell").forEach((c) => c.classList.remove("active"));
      cell.classList.add("active");
      selectedSize = cell.dataset.size;
    });

    // 数量
    let qty = 1;
    $("#qtyDec").addEventListener("click", () => { qty = Math.max(1, qty - 1); $("#qtyVal").textContent = qty; });
    $("#qtyInc").addEventListener("click", () => { qty = Math.min(9, qty + 1); $("#qtyVal").textContent = qty; });

    // 加购
    $("#addBtn").addEventListener("click", () => {
      if (!selectedSize) {
        toast("Pick a size first — or let the AI choose for you", icon("ruler", 14));
        $("#openFinder").focus();
        return;
      }
      API.addToCart(p.id, selectedSize, qty, $("input[name=widthOpt]:checked").value);
      renderCart();
      toast("Added — EU " + selectedSize + " · " + $("input[name=widthOpt]:checked").value + " width");
      openCart();
    });

    // 合脚度分布
    const fs = p.fitStats;
    $("#histRows").innerHTML =
      histRow("Runs small", fs.small, false) + histRow("True to size", fs.true, true) + histRow("Runs large", fs.large, false);
    function histRow(label, pct, major) {
      return '<div class="hist-row' + (major ? " major" : "") + '"><span>' + label + '</span><div class="hist-bar"><i style="width:' + pct + '%"></i></div><span class="pct">' + pct + "%</span></div>";
    }

    // 评价（本商品优先，不足 3 条则补充其他商品高分评价）
    const own = DB.reviews.filter((r) => r.productId === p.id);
    const fill = DB.reviews.filter((r) => r.productId !== p.id).slice(0, Math.max(0, 3 - own.length));
    $("#pdpReviews").innerHTML = own.concat(fill).slice(0, 3).map((r) => reviewHtml(r)).join("");
    function reviewHtml(r) {
      return (
        '<article class="pdp-review"><div><div class="who">' + esc(r.author) + "</div>" +
        '<div class="meta">' + starsHtml(r.rating) + "<span>EU " + esc(r.size) + " · " + esc(r.fit) + "</span></div></div>" +
        "<div><p>" + esc(r.body) + "</p>" +
        '<div class="verified-chip" style="margin-top:10px">' + icon("checkCircle", 13) + " Verified purchase · " + r.days + " days ago</div></div></article>"
      );
    }

    // 相关推荐（不同类目的 4 款）
    $("#relatedGrid").innerHTML = DB.products.filter((x) => x.id !== p.id).slice(0, 4)
      .map((x) => productCardHtml(x, "reveal")).join("");

    // AI Size Finder
    initSizeFinder(p, {
      onApply(rec, opts) {
        const matched = p.sizes.find((s) => Math.abs(parseFloat(s) - parseFloat(rec.size)) < 0.26);
        renderSizes({ ...rec, matched: true });
        if (matched && !opts?.silent) {
          const cell = $('#sizeGrid [data-size="' + matched + '"]');
          if (cell) { cell.classList.add("active"); selectedSize = matched; }
        }
      },
    });
    if (params.get("finder") === "1") $("#openFinder").click();
  }
});
