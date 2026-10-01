/* ============================================================
   mock.js — SOLFIT 单一数据源（所有页面从 DB 读取，禁止散落硬编码）
   图片统一走 text_to_image API（运行时 encodeURIComponent 拼接）
   ============================================================ */

const IMG_API = "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image";

function img(prompt, size) {
  return IMG_API + "?prompt=" + encodeURIComponent(prompt) + "&image_size=" + (size || "square");
}

const SHOT = (desc) =>
  desc + ", single shoe, professional studio product photography, warm beige seamless background, soft natural lighting, centered composition, high-end ecommerce catalog photo, no people, no text";

/* 商品数据 —— 10 款核心 SKU（2–3 个楦型家族，聚焦数据闭环） */
window.DB = {
  products: [
    {
      id: 1, name: "The Aurora Loafer", category: "Loafers", heel: "Flat",
      widths: ["Standard", "Wide"], price: 118, compareAt: null,
      rating: 4.8, reviewsCount: 1243,
      fitStats: { small: 9, true: 85, large: 6 },
      badge: "Bestseller", sizes: ["36","37","38","39","40","41","42"], oos: ["36"],
      desc: "A buttery-soft penny loafer in Italian calf leather, built on our signature W2 last with a slightly rounded toe box and 4mm of cushioned cork underfoot. Broken in from the first wear, not the third month.",
      features: ["Italian calf leather, vegetable-tanned", "W2 last — forgiving for wider forefeet", "Recycled cork footbed, 4mm heel-to-toe drop"],
      aiFitNote: "Runs half a size generous on the W2 last. If you are between sizes, size down.",
      prompt: SHOT("elegant cream leather penny loafer with rounded toe and low profile"),
    },
    {
      id: 2, name: "Cloud Walker Sneaker", category: "Sneakers", heel: "Flat",
      widths: ["Standard"], price: 98, compareAt: 128,
      rating: 4.9, reviewsCount: 2867,
      fitStats: { small: 6, true: 90, large: 4 },
      badge: "Bestseller", sizes: ["36","37","38","39","40","41","42"], oos: [],
      desc: "Our lightest everyday sneaker — one-piece knit upper over a cloud-sole that packs 22% bio-based foam. Slip it on, forget you're wearing it.",
      features: ["One-piece breathable knit upper", "22% bio-based CloudFoam midsole", "Machine washable"],
      aiFitNote: "True to size. Knit upper relaxes ~3mm after two weeks of wear.",
      prompt: SHOT("minimalist white leather low-top sneaker with clean cream sole"),
    },
    {
      id: 3, name: "Emmeline Block Heel", category: "Heels", heel: "Mid",
      widths: ["Standard", "Wide"], price: 132, compareAt: null,
      rating: 4.6, reviewsCount: 489,
      fitStats: { small: 14, true: 78, large: 8 },
      badge: "New", sizes: ["36","37","38","39","40","41"], oos: ["37"],
      desc: "A 45mm satin block heel engineered for occasions — reinforced arch shank, padded heel cup and an ankle strap that actually stays put through a full ceremony.",
      features: ["45mm stable block heel", "Satin upper with reinforced shank", "Padded heel cup + adjustable strap"],
      aiFitNote: "Runs slightly small in the toe box. Half-up recommended for wide feet.",
      prompt: SHOT("elegant blush pink satin pump with low block heel and ankle strap"),
    },
    {
      id: 4, name: "Trail Breeze Slip-On", category: "Sneakers", heel: "Flat",
      widths: ["Standard", "Wide"], price: 89, compareAt: null,
      rating: 4.7, reviewsCount: 932,
      fitStats: { small: 8, true: 84, large: 8 },
      badge: null, sizes: ["36","37","38","39","40","41","42"], oos: [],
      desc: "A knit slip-on that behaves like a sock and cushions like a trainer. The stretch upper adapts to bunions and high arches without pressure points.",
      features: ["Adaptive stretch-knit upper", "Washable, quick-dry footbed", "Heel pull-tab"],
      aiFitNote: "True to size. The knit adapts to foot swelling across the day.",
      prompt: SHOT("olive green knit slip-on sneaker with flexible white sole"),
    },
    {
      id: 5, name: "Marina Strappy Sandal", category: "Sandals", heel: "Flat",
      widths: ["Standard"], price: 79, compareAt: null,
      rating: 4.5, reviewsCount: 611,
      fitStats: { small: 12, true: 80, large: 8 },
      badge: null, sizes: ["36","37","38","39","40","41"], oos: ["41"],
      desc: "Vacuum-tanned leather straps over our contoured WF footbed — a flat sandal with actual arch support, finished with a non-slip resin outsole.",
      features: ["Contoured arch-support footbed", "Non-slip resin outsole", "Adjustable ankle buckle"],
      aiFitNote: "Straps are true to size; footbed runs narrow. Wide feet: consider Aurora instead.",
      prompt: SHOT("tan leather flat sandal with cross straps and minimal silhouette"),
    },
    {
      id: 6, name: "Onyx Court Sneaker", category: "Sneakers", heel: "Low",
      widths: ["Standard"], price: 108, compareAt: null,
      rating: 4.7, reviewsCount: 1388,
      fitStats: { small: 11, true: 82, large: 7 },
      badge: null, sizes: ["36","37","38","39","40","41","42"], oos: [],
      desc: "A dress-court silhouette in matte black leather that passes with tailoring and survives airports. Cupsole construction, zero squeak.",
      features: ["Matte full-grain black leather", "Stitched cupsole construction", "Memory-foam collar"],
      aiFitNote: "Snug leather lining — half-up if you wear thick socks.",
      prompt: SHOT("all black matte leather court sneaker with clean minimal design"),
    },
    {
      id: 7, name: "Willow Wide Loafer", category: "Loafers", heel: "Flat",
      widths: ["Wide"], price: 115, compareAt: null,
      rating: 4.9, reviewsCount: 734,
      fitStats: { small: 4, true: 92, large: 4 },
      badge: "Wide Fit", sizes: ["36","37","38","39","40","41","42"], oos: [],
      desc: "Built on our W4 wide last from day one — not a stretched standard pattern. A chestnut suede loafer with a genuinely roomy toe box that still holds a tailored line.",
      features: ["True W4 wide last (not stretched)", "Chestnut water-repellent suede", "Orthotic-friendly removable insole"],
      aiFitNote: "Designed for EE-width feet and bunions. Order your usual size.",
      prompt: SHOT("chestnut brown suede wide loafer with roomy rounded toe"),
    },
    {
      id: 8, name: "Studio Mary Jane", category: "Heels", heel: "Low",
      widths: ["Standard", "Wide"], price: 102, compareAt: 118,
      rating: 4.6, reviewsCount: 401,
      fitStats: { small: 13, true: 81, large: 6 },
      badge: null, sizes: ["36","37","38","39","40","41"], oos: [],
      desc: "A 30mm mary jane in polished calf leather — the office-to-dinner workhorse with a strap set exactly where the instep needs hold.",
      features: ["30mm stacked heel", "Polished calf leather", "Secure instep strap"],
      aiFitNote: "True to size; instep strap adds ~5mm of volume tolerance.",
      prompt: SHOT("black leather mary jane shoe with single strap and low heel"),
    },
    {
      id: 9, name: "Voyage Chelsea Boot", category: "Boots", heel: "Low",
      widths: ["Standard", "Wide"], price: 148, compareAt: null,
      rating: 4.8, reviewsCount: 655,
      fitStats: { small: 10, true: 83, large: 7 },
      badge: "New", sizes: ["36","37","38","39","40","41","42"], oos: ["42"],
      desc: "A taupe suede chelsea with hand-stitched elastic gores and a 25mm rockered sole. Repels drizzle, boards planes, walks cobblestones.",
      features: ["Water-repellent taupe suede", "Hand-stretched elastic gores", "Rockered 25mm sole"],
      aiFitNote: "Generous in the midfoot with socks on. Size down if between.",
      prompt: SHOT("taupe suede chelsea boot with elastic side panel and low stacked sole"),
    },
    {
      id: 10, name: "Haven Wool Mule", category: "Slippers", heel: "Flat",
      widths: ["Standard", "Wide"], price: 68, compareAt: null,
      rating: 4.7, reviewsCount: 1022,
      fitStats: { small: 15, true: 79, large: 6 },
      badge: null, sizes: ["36","37","38","39","40","41"], oos: [],
      desc: "Merino-wool slipper mule with a suede outsole that grips hardwood. Cold-washable, cockpit-approved, designed to disappear into carry-ons.",
      features: ["Merino wool upper, temperature regulating", "Suede non-slip outsole", "Folds flat for travel"],
      aiFitNote: "Wool relaxes with wear — if between, size down.",
      prompt: SHOT("cozy cream wool slipper mule with soft rounded shape"),
    },
  ],

  /* 商品图 URL（由 prompt 即时生成） */
  imageFor(p) { return img(p.prompt, "square"); },

  heroImage: img(
    "elegant young woman walking on sunlit european street wearing cream minimalist sneakers and beige trench coat, editorial fashion photography, warm morning light, shallow depth of field",
    "portrait_4_3"
  ),
  scienceImage: img(
    "close up of artisan hands measuring a wooden shoe last with calipers in a warm shoemaking workshop, editorial photography, warm tungsten light",
    "landscape_4_3"
  ),

  /* 评价数据（PDP + 首页评价墙） */
  reviews: [
    { productId: 1, author: "Priya N.", rating: 5, size: "EU 39", fit: "True to size", days: 12, verified: true,
      body: "The fit quiz told me 39 when every brand has me in 40. It was right — this is the first loafer I haven't had to break in. Wore them 9 hours straight at a conference." },
    { productId: 1, author: "Marta K.", rating: 5, size: "EU 40", fit: "Runs slightly large", days: 25, verified: true,
      body: "Ordered my usual 40 on the AI recommendation with the 'runs generous' note, should have listened and taken 39.5. Exchange was free though, second pair was perfect." },
    { productId: 2, author: "Jordan T.", rating: 5, size: "EU 42", fit: "True to size", days: 6, verified: true,
      body: "The stylist chat actually understood 'sneaker for wide feet that doesn't look orthopedic'. Cloud Walker in 42 wide is exactly that." },
    { productId: 7, author: "Renee W.", rating: 5, size: "EU 39", fit: "True to size", days: 40, verified: true,
      body: "EE width, bunions, 30 years of shoe misery. The Willow is the first loafer that didn't need a single stretch. I bought the second pair before writing this." },
    { productId: 3, author: "Chloe D.", rating: 4, size: "EU 37.5", fit: "Runs slightly small", days: 18, verified: true,
      body: "Wore them to my best friend's wedding — 6 hours, danced twice. The scan said half-up due to my high instep and it was spot on. One star off because the strap needed re-buckling once." },
    { productId: 9, author: "Hana S.", rating: 5, size: "EU 38", fit: "True to size", days: 9, verified: true,
      body: "Used the size finder from the chat — took 40 seconds. Boots arrived, fit exactly as promised, zero heel slip with wool socks." },
    { productId: 10, author: "Ellie B.", rating: 5, size: "EU 38", fit: "True to size", days: 3, verified: true,
      body: "Bought as a gift, kept them. The fit profile saved me from guessing my mom's size — I used her usual Nike size and the conversion was perfect." },
    { productId: 4, author: "Ava M.", rating: 4, size: "EU 39", fit: "Runs slightly small", days: 22, verified: true,
      body: "Knit is super adaptive over my bunion. Sized up half as suggested and it's roomy in a good way. Docking one star — wish the sole came in darker colorways." },
  ],

  /* 聊天意图（Fit Stylist 的关键词匹配脚本，演示用） */
  chatIntents: [
    {
      keywords: ["wedding", "bride", "ceremony", "marriage", "新娘", "婚礼"],
      reply: "Beautiful occasion! For weddings I recommend keeping the heel under 45mm so you survive the dancing. Here are my top picks — both have padded heel cups:",
      productIds: [3, 8],
    },
    {
      keywords: ["wide", "bunion", "ee", "comfort", "commute", "walk", "宽", "舒适", "通勤"],
      reply: "I hear you on comfort — 60% of people wear the wrong width without knowing. These are built on wide-specific lasts (not stretched patterns), ideal for all-day wear:",
      productIds: [7, 4],
    },
    {
      keywords: ["sneaker", "trainer", "sport", "casual", "white"],
      reply: "Sneakers — our home turf. Cloud Walker is the everyday icon; Onyx Court dresses up when you need it to:",
      productIds: [2, 6],
    },
    {
      keywords: ["loafer", "work", "office", "leather", "business"],
      reply: "For office-grade loafers, Aurora is our bestseller with a forgiving toe box, and Willow is a true wide last:",
      productIds: [1, 7],
    },
    {
      keywords: ["boot", "rain", "winter", "chelsea"],
      reply: "The Voyage Chelsea handles drizzle and cobblestones with a rockered sole. Taupe suede pairs with almost everything:",
      productIds: [9],
    },
    {
      keywords: ["sandal", "summer", "beach", "flat"],
      reply: "Summer flats — the Marina looks minimal but hides a real arch-support footbed:",
      productIds: [5],
    },
    {
      keywords: ["size", "fit", "measure", "my size", "recommend", "尺码", "推荐"],
      reply: "I can nail your size in under a minute — open the AI Size Finder on any product page, or start with our bestseller here. If you tell me your usual brand + size, I can also compare lasts for you:",
      productIds: [1, 2],
    },
    {
      keywords: ["slipper", "home", "gift", "cozy"],
      reply: "Cozy call. The Haven mule is merino, machine washable, and a failsafe gift (the fit profile handles the size guessing for you):",
      productIds: [10],
    },
  ],
  chatFallback: "I'm a demo stylist with a few scripted superpowers — try the chips below, ask for a category (heels, loafers, sneakers…), or tap 'Find my size' on any product page for the full AI fitting.",
  chatGreetings: [
    { label: "Wedding heels, 4cm max", text: "I need wedding heels under 4cm heel" },
    { label: "Wide feet, comfy commute", text: "Wide feet, something comfortable for commuting" },
    { label: "What's my size?", text: "What's my size?" },
  ],
};
