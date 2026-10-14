#!/usr/bin/env node
/**
 * scripts/seed-demo.mjs — 后台演示数据种子（HTTP 驱动）
 *
 * 用途：沙箱回收后内存数据清空，跑一遍让后台所有模块（仪表盘/订单/评价/会员/
 *      优惠码/AI 营销/数据分析）都有真实数据可看。
 * 前置：服务器已启动（默认 http://localhost:3000）；.env 需含 ENABLE_DEBUG_SEED=1。
 * 运行：npm run seed:demo
 *
 * 幂等性：注册按邮箱去重会报 USER_EXISTS（可忽略）；重复跑会叠加订单/评价
 *        （评价 ALREADY_REVIEWED 自动跳过）。
 */
const BASE = process.env.SEED_BASE_URL || "http://localhost:3000";
const ADMIN = { "x-admin-token": process.env.ADMIN_TOKEN || "dev-admin-token" };

const log = (...a) => console.log("·", ...a);
const warn = (label, r) => console.warn(`  ! ${label} -> ${r.status} ${r.json?.message ?? "(no body)"}`);

// ---------- 会话（cookie jar）----------
async function newSession() {
  const res = await fetch(`${BASE}/api/cart`);
  const m = (res.headers.get("set-cookie") || "").match(/solfit_sid=[^;]+/);
  if (!m) throw new Error("未取到 solfit_sid —— 服务器是否已启动？");
  return { cookie: m[0], sid: m[0].split("=")[1] };
}

async function call(s, method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(s?.cookie ? { cookie: s.cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* 204 等 */ }
  return { status: res.status, json };
}

/** 触发一次首页 SSR（带会话 cookie）——推荐印象回流，喂归因/实验数据 */
async function touchHome(s) {
  try { await fetch(BASE + "/", { headers: { cookie: s.cookie } }); } catch { /* 忽略 */ }
}

// ---------- 商品目录（运行时拉取，不硬编码）----------
async function loadCatalog() {
  const r = await call(null, "GET", "/api/products");
  const products = (r.json?.data?.products || r.json?.data || []).filter((p) => p.listed !== false);
  if (!products.length) throw new Error("商品目录为空：" + JSON.stringify(r.json).slice(0, 120));
  return products;
}

// ---------- 埋点辅助 ----------
async function view(s, p) {
  const r = await call(s, "POST", "/api/events", {
    events: [{ name: "product_viewed", props: { productId: p.id, category: p.category, sessionId: s.sid } }],
  });
  if (r.json?.code !== 0) warn("product_viewed", r);
}
async function checkoutStarted(s) {
  await call(s, "POST", "/api/events", {
    events: [{ name: "checkout_started", props: { sessionId: s.sid, currency: "USD" } }],
  });
}

// ---------- 交易流 ----------
async function addToCart(s, p, size, qty = 1) {
  let r = await call(s, "POST", "/api/cart", { action: "add", productId: p.id, size, width: "Standard", qty });
  if (r.json?.code !== 0) return warn(`加购 ${p.name}`, r);
  // 补一条 schema 完整的 cart_added（路由自动埋点缺商品字段，人群计算需要完整画像）
  r = await call(s, "POST", "/api/events", {
    events: [{ name: "cart_added", props: { sessionId: s.sid, productId: p.id, size, width: "Standard", qty, action: "add" } }],
  });
  if (r.json?.code !== 0) warn("cart_added", r);
}

async function placeOrder(s, { email, address, promoCode, pointsToRedeem }) {
  await checkoutStarted(s);
  const r = await call(s, "POST", "/api/checkout", {
    action: "place",
    email,
    address,
    paymentMethod: "demo_card",
    ...(promoCode ? { promoCode } : {}),
    ...(pointsToRedeem ? { pointsToRedeem } : {}),
  });
  if (r.json?.code !== 0) return warn("下单", r), null;
  const order = r.json.data;
  log(`下单成功 ${order.id}（$${order.totals?.total} · ${address.country}）`);
  return order;
}

async function register(s, { email, password, name }) {
  let r = await call(s, "POST", "/api/auth/register", { email, password, name });
  if (r.json?.code === 0) return r.json.data.user;
  if (r.json?.message === "USER_EXISTS") {
    // 重复跑种子：账号已存在 —— 登录把当前会话绑到账户（订单/积分才能挂到会员名下）
    r = await call(s, "POST", "/api/auth/login", { email, password });
    if (r.json?.code === 0) return r.json.data.user;
    warn(`登录 ${email}`, r);
    return null;
  }
  warn(`注册 ${email}`, r);
  return null;
}

async function review(s, p, { rating, title, body, fit, size }) {
  const r = await call(s, "POST", "/api/reviews", { productId: p.id, rating, title, body, fit, ...(size ? {} : {}) });
  if (r.json?.code !== 0) return warn(`评价 ${p.name}`, r);
  log(`评价 +${rating}★ ${p.name}（${fit}）`);
}

async function exchange(s, order, p, { fromSize, toSize, reason }) {
  const r = await call(s, "PUT", "/api/orders", { orderId: order.id, productId: p.id, fromSize, toSize, reason });
  if (r.json?.code !== 0) return warn("换货/退货", r);
  log(`${toSize ? "换货" : "退货"} ${order.id}（${reason}）`);
}

function ship(orderId) {
  return call(null, "POST", "/api/admin/orders", { action: "mark_shipped", orderId }, ADMIN);
}

async function backdateOrder(s, p, { daysAgo, total, email }) {
  const r = await call(null, "POST", "/api/debug/seed-order", { sessionId: s.sid, productId: p.id, daysAgo, total, email });
  if (r.json?.code !== 0) return warn(`回溯订单 ${daysAgo}d`, r), null;
  const id = r.json.data.orderId;
  log(`回溯订单 ${id}（${daysAgo} 天前 · $${total}）`);
  return id;
}

// ---------- 地址池（order service 必填：name/street/city/zip/country）----------
const ADDRESS = {
  US: (name) => ({ name, street: "88 Mercer Street, Apt 4B", city: "New York", state: "NY", zip: "10012", country: "US", phone: "+1 212 555 0148" }),
  DE: (name) => ({ name, street: "Torstraße 120", city: "Berlin", zip: "10119", country: "DE", phone: "+49 30 555 0182" }),
  GB: (name) => ({ name, street: "14 Shoreditch High Street", city: "London", zip: "E1 6JJ", country: "GB", phone: "+44 20 5550 0139" }),
  FR: (name) => ({ name, street: "22 Rue de Rivoli", city: "Paris", zip: "75004", country: "FR", phone: "+33 1 55 55 01 55" }),
  CA: (name) => ({ name, street: "550 Granville Street", city: "Vancouver", state: "BC", zip: "V6C 1W6", country: "CA", phone: "+1 604 555 0166" }),
};

// ---------- 主演出脚本 ----------
async function main() {
  console.log(`\nSOLFIT 演示数据种子 → ${BASE}\n`);
  const P = await loadCatalog(); // 10 个在售商品
  const byCat = (c, i = 0) => P.filter((p) => p.category === c)[i] || P[i];
  const SNEAKER = byCat("Sneakers");
  const SNEAKER2 = byCat("Sneakers", 1) || SNEAKER;
  const LOAFER = byCat("Loafers");
  const HEEL = byCat("Heels");
  const SANDAL = byCat("Sandals") || SNEAKER;
  const size = (p, i = 2) => p.sizes[i] || p.sizes[0];

  // ===== 优惠码（商家视角创建）=====
  console.log("\n[1/5] 优惠码");
  for (const [code, def] of [
    ["WELCOME10", { type: "percent", value: 10 }],
    ["FIT15", { type: "percent", value: 15, minSpend: 100 }],
    ["VIP25", { type: "fixed", value: 25, minSpend: 150 }],
    ["SPRING20", { type: "percent", value: 20 }],
  ]) {
    let r = await call(null, "POST", "/api/admin/promos", { action: "create", code, ...def }, ADMIN);
    if (r.json?.code !== 0 && r.json?.message !== "PROMO_EXISTS") warn(`优惠码 ${code}`, r);
    else log(`优惠码 ${code} 就绪`);
  }
  await call(null, "POST", "/api/admin/promos", { action: "deactivate", code: "SPRING20" }, ADMIN);

  // ===== 人设与剧本 =====
  console.log("\n[2/5] 会话 · 注册 · 浏览 · 加购");
  const mkPersona = async (label) => {
    const s = await newSession();
    await touchHome(s); // 推荐印象（归因/实验数据源）
    log(`会话 ${label}（${s.sid}）`);
    return s;
  };

  // —— 1. Ava：注册会员，双单，首单用券后换码，二单回溯 ——
  const ava = await mkPersona("Ava/US");
  await register(ava, { email: "ava.wilson@example.com", password: "Demo1234!", name: "Ava Wilson" });
  await view(ava, SNEAKER); await view(ava, LOAFER);
  await addToCart(ava, SNEAKER, size(SNEAKER), 2);
  await addToCart(ava, LOAFER, size(LOAFER), 1);
  const avaOrder1 = await placeOrder(ava, { email: "ava.wilson@example.com", address: ADDRESS.US("Ava Wilson"), promoCode: "WELCOME10" });
  if (avaOrder1) await exchange(ava, avaOrder1, SNEAKER, { fromSize: size(SNEAKER), toSize: size(SNEAKER, 3), reason: "too_small" });
  await review(ava, LOAFER, { rating: 5, title: "Zero break-in, truly", body: "Wore them a full trade-show day straight out of the box. The cork footbed is real.", fit: "true_to_size" });

  // —— 2. Liam：注册会员，正常单 → 已发货 → 五星好评 ——
  const liam = await mkPersona("Liam/US");
  await register(liam, { email: "liam.chen@example.com", password: "Demo1234!", name: "Liam Chen" });
  await view(liam, SNEAKER2); await view(liam, HEEL);
  await addToCart(liam, SNEAKER2, size(SNEAKER2));
  const liamOrder = await placeOrder(liam, { email: "liam.chen@example.com", address: ADDRESS.US("Liam Chen") });
  if (liamOrder) {
    const r = await ship(liamOrder.id);
    if (r.json?.code === 0) log(`发货 ${liamOrder.id}`);
    await review(liam, SNEAKER2, { rating: 5, title: "Like walking on clouds", body: "Knit upper breathes, midsole is bouncy all day. Ordered my scanner size and it was perfect.", fit: "true_to_size" });
  }

  // —— 3. Emma：德国注册会员，含税单 → 待发货 ——
  const emma = await mkPersona("Emma/DE");
  await register(emma, { email: "emma.mueller@example.com", password: "Demo1234!", name: "Emma Müller" });
  await view(emma, SANDAL); await view(emma, LOAFER); await view(emma, LOAFER); // 类目偏好信号
  await addToCart(emma, SANDAL, size(SANDAL));
  const emmaOrder = await placeOrder(emma, { email: "emma.mueller@example.com", address: ADDRESS.DE("Emma Müller") });
  if (emmaOrder) await review(emma, SANDAL, { rating: 4, title: "Arch support is no joke", body: "First flat sandal I can walk 10k steps in. Strap rubbed slightly on day one.", fit: "true_to_size" });

  // —— 4. Noah：英国游客单 → 已发货，偏大反馈（尺码引擎燃料）——
  const noah = await mkPersona("Noah/GB");
  await view(noah, SNEAKER);
  await addToCart(noah, SNEAKER, size(SNEAKER, 3));
  const noahOrder = await placeOrder(noah, { email: "noah.smith@example.com", address: ADDRESS.GB("Noah Smith") });
  if (noahOrder) {
    const r = await ship(noahOrder.id);
    if (r.json?.code === 0) log(`发货 ${noahOrder.id}`);
    await review(noah, SNEAKER, { rating: 4, title: "Great shoe, size up half", body: "Quality is top notch but the knit runs slightly long on my pair.", fit: "too_large" });
  }

  // —— 5/7. Olivia & Lucas：弃购（AI 召回名单）+ 订阅 ——
  for (const [label, email, name, p] of [
    ["Olivia/FR", "olivia.dubois@example.com", "Olivia Dubois", HEEL],
    ["Lucas/DE", "lucas.weber@example.com", "Lucas Weber", SNEAKER2],
  ]) {
    const s = await mkPersona(label);
    await view(s, p); await view(s, p); await view(s, SANDAL);
    await addToCart(s, p, size(p));
    let r = await call(s, "POST", "/api/notifications/subscribe", { email });
    if (r.json?.code === 0) log(`弃购 + 订阅 ${email}`);
    else warn("订阅", r);
  }

  // —— 6. Mia：注册会员，品质退货 ——
  const mia = await mkPersona("Mia/US");
  await register(mia, { email: "mia.johnson@example.com", password: "Demo1234!", name: "Mia Johnson" });
  await view(mia, LOAFER);
  await addToCart(mia, LOAFER, size(LOAFER));
  const miaOrder = await placeOrder(mia, { email: "mia.johnson@example.com", address: ADDRESS.US("Mia Johnson") });
  if (miaOrder) await exchange(mia, miaOrder, LOAFER, { fromSize: size(LOAFER), toSize: null, reason: "quality" });

  // —— 8. Sophie：30 天内双笔 paid → RFM vip 分层（复购老客）——
  const sophie = await mkPersona("Sophie/US");
  await register(sophie, { email: "sophie.taylor@example.com", password: "Demo1234!", name: "Sophie Taylor" });
  await view(sophie, HEEL); await view(sophie, SANDAL);
  await addToCart(sophie, HEEL, size(HEEL));
  await placeOrder(sophie, { email: "sophie.taylor@example.com", address: ADDRESS.US("Sophie Taylor"), pointsToRedeem: 0 });
  await backdateOrder(sophie, HEEL, { daysAgo: 25, total: 132, email: "sophie.taylor@example.com" });

  // —— 10. Isabella：法国注册会员，待发货，偏小反馈 ——
  const bella = await mkPersona("Isabella/FR");
  await register(bella, { email: "isabella.rossi@example.com", password: "Demo1234!", name: "Isabella Rossi" });
  await view(bella, HEEL); await view(bella, LOAFER);
  await addToCart(bella, HEEL, size(HEEL));
  const bellaOrder = await placeOrder(bella, { email: "isabella.rossi@example.com", address: ADDRESS.FR("Isabella Rossi") });
  if (bellaOrder) await review(bella, HEEL, { rating: 4, title: "Beautiful, but snug", body: "Gorgeous satin and the block heel is stable. Wish I'd sized up for wide feet.", fit: "too_small" });

  // —— 11. Jack：挽回窗口老客（回溯 120 天 → RFM at_risk 分层）——
  const jack = await mkPersona("Jack/US");
  await register(jack, { email: "jack.wilson@example.com", password: "Demo1234!", name: "Jack Wilson" });
  await backdateOrder(jack, LOAFER, { daysAgo: 120, total: 118, email: "jack.wilson@example.com" });

  // —— 11b. 沉睡会话（回溯 200 天 → RFM lapsed 分层）——
  const dormant = await mkPersona("Dormant/US");
  await backdateOrder(dormant, SNEAKER, { daysAgo: 200, total: 98, email: "dormant.buyer@example.com" });

  // —— 9. Ethan：只逛不买（浏览再营销人群）——
  const ethan = await mkPersona("Ethan/US");
  await view(ethan, SNEAKER); await view(ethan, SNEAKER2); await view(ethan, SANDAL);

  // —— 12. Chloe：类目爱好者（Sneakers 浏览 ≥2 次未购）——
  const chloe = await mkPersona("Chloe/CA");
  await view(chloe, SNEAKER); await view(chloe, SNEAKER2); await view(chloe, SNEAKER);

  // ===== 3/5 订阅带（首页订阅 + 营销订阅）=====
  console.log("\n[3/5] 订阅带");
  const olivia = { cookie: null }; // 已在上面订阅过，这里补两个纯订阅
  for (const email of ["harry.kim@example.com", "nina.petrova@example.com"]) {
    const s = await newSession();
    const r = await call(s, "POST", "/api/notifications/subscribe", { email });
    if (r.json?.code === 0) log(`订阅 ${email}`);
    else warn("订阅", r);
  }

  // ===== 4/5 AI 尺码推荐（问卷三件套，AI 覆盖率数据源）=====
  console.log("\n[4/5] AI 尺码推荐");
  const profiles = [
    { usualSize: "38", usualBrand: "Nike", widthFeel: "Standard", footNotes: [] },
    { usualSize: "40", usualBrand: "Adidas", widthFeel: "Wide", footNotes: ["Bunion"] },
    { usualSize: "41", usualBrand: "New Balance", widthFeel: "Narrow", footNotes: ["High arch"] },
    { usualSize: "37.5", usualBrand: "Vionic", widthFeel: "Standard", footNotes: ["Flat feet"] },
  ];
  for (const pf of profiles) {
    const s = await newSession();
    const r = await call(s, "POST", "/api/ai/size-recommendation", { ...pf, productId: SNEAKER.id });
    if (r.json?.code === 0) log(`尺码推荐 ${pf.usualSize}@${pf.usualBrand} → ${r.json.data?.size ?? "?"}`);
    else warn("尺码推荐", r);
  }

  // ===== 5/5 收尾：经营概览 =====
  console.log("\n[5/5] 经营概览");
  const r = await call(null, "GET", "/api/admin/overview", null, ADMIN);
  if (r.json?.code === 0) {
    const k = r.json.data.stats;
    console.log(`\n  GMV $${Math.round(k.gmvUsd)} · 订单 ${k.orders}（待发 ${k.toShip} / 已发 ${k.shipped} / 售后 ${k.afterSales}）`);
    console.log(`  会员 ${k.registeredUsers} · 商品 ${k.products} · 缺码 ${k.oosSizes}`);
  } else warn("overview", r);
  console.log("\n种子完成 —— 打开 /admin/merchant 查看完整版后台。\n");
}

main().catch((e) => {
  console.error("种子失败：", e.message);
  process.exit(1);
});
