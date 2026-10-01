/**
 * data/products.js — 种子数据（Phase 1：内存；Phase 2：PostgreSQL products 表）
 * 结构化商品属性是 AI 导购/推荐的前提 —— 场景/跟高/宽窄必须结构化，不能只藏在文案里
 */

const IMG_API = "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image";
const SHOT = (d) =>
  d + ", single shoe, professional studio product photography, warm beige seamless background, soft natural lighting, high-end ecommerce catalog photo";
const img = (p) => IMG_API + "?prompt=" + encodeURIComponent(p) + "&image_size=square";

export const PRODUCTS = [
  {
    id: 1, slug: "aurora-loafer", name: "The Aurora Loafer", category: "Loafers", heel: "Flat",
    widths: ["Standard", "Wide"], price: 118, compareAt: null, currency: "USD",
    rating: 4.8, reviewsCount: 1243, badge: "Bestseller",
    fitStats: { small: 9, true: 85, large: 6 },     // 退货数据回流产物（V3 模型燃料）
    sizes: ["36", "37", "38", "39", "40", "41", "42"], oos: ["36"],
    lastCode: "W2",                                   // 楦型库 —— 尺码推荐核心资产
    desc: "A buttery-soft penny loafer in Italian calf leather, built on our signature W2 last with 4mm of cushioned cork underfoot.",
    features: ["Italian calf leather", "W2 last — forgiving for wider forefeet", "Recycled cork footbed"],
    image: img(SHOT("elegant cream leather penny loafer with rounded toe and low profile")),
  },
  {
    id: 2, slug: "cloud-walker-sneaker", name: "Cloud Walker Sneaker", category: "Sneakers", heel: "Flat",
    widths: ["Standard"], price: 98, compareAt: 128, currency: "USD",
    rating: 4.9, reviewsCount: 2867, badge: "Bestseller",
    fitStats: { small: 6, true: 90, large: 4 },
    sizes: ["36", "37", "38", "39", "40", "41", "42"], oos: [],
    lastCode: "W1",
    desc: "Our lightest everyday sneaker — one-piece knit upper over a cloud-sole with 22% bio-based foam.",
    features: ["One-piece knit upper", "22% bio-based CloudFoam", "Machine washable"],
    image: img(SHOT("minimalist white leather low-top sneaker with clean cream sole")),
  },
  {
    id: 3, slug: "emmeline-block-heel", name: "Emmeline Block Heel", category: "Heels", heel: "Mid",
    widths: ["Standard", "Wide"], price: 132, compareAt: null, currency: "USD",
    rating: 4.6, reviewsCount: 489, badge: "New",
    fitStats: { small: 14, true: 78, large: 8 },
    sizes: ["36", "37", "38", "39", "40", "41"], oos: ["37"],
    lastCode: "H1",
    desc: "A 45mm satin block heel engineered for occasions — reinforced arch shank and padded heel cup.",
    features: ["45mm stable block heel", "Reinforced shank", "Padded heel cup"],
    image: img(SHOT("elegant blush pink satin pump with low block heel and ankle strap")),
  },
  {
    id: 4, slug: "trail-breeze-slip-on", name: "Trail Breeze Slip-On", category: "Sneakers", heel: "Flat",
    widths: ["Standard", "Wide"], price: 89, compareAt: null, currency: "USD",
    rating: 4.7, reviewsCount: 932, badge: null,
    fitStats: { small: 8, true: 84, large: 8 },
    sizes: ["36", "37", "38", "39", "40", "41", "42"], oos: [],
    lastCode: "W3",
    desc: "A knit slip-on that behaves like a sock and cushions like a trainer, adapting to bunions and high arches.",
    features: ["Adaptive stretch-knit upper", "Washable footbed", "Heel pull-tab"],
    image: img(SHOT("olive green knit slip-on sneaker with flexible white sole")),
  },
  {
    id: 5, slug: "marina-sandal", name: "Marina Strappy Sandal", category: "Sandals", heel: "Flat",
    widths: ["Standard"], price: 79, compareAt: null, currency: "USD",
    rating: 4.5, reviewsCount: 611, badge: null,
    fitStats: { small: 12, true: 80, large: 8 },
    sizes: ["36", "37", "38", "39", "40", "41"], oos: ["41"],
    lastCode: "F1",
    desc: "Vacuum-tanned leather straps over our contoured WF footbed — a flat sandal with actual arch support.",
    features: ["Arch-support footbed", "Non-slip outsole", "Adjustable buckle"],
    image: img(SHOT("tan leather flat sandal with cross straps and minimal silhouette")),
  },
  {
    id: 6, slug: "onyx-court-sneaker", name: "Onyx Court Sneaker", category: "Sneakers", heel: "Low",
    widths: ["Standard"], price: 108, compareAt: null, currency: "USD",
    rating: 4.7, reviewsCount: 1388, badge: null,
    fitStats: { small: 11, true: 82, large: 7 },
    sizes: ["36", "37", "38", "39", "40", "41", "42"], oos: [],
    lastCode: "W1",
    desc: "A dress-court silhouette in matte black leather — cupsole construction, zero squeak.",
    features: ["Matte full-grain leather", "Stitched cupsole", "Memory-foam collar"],
    image: img(SHOT("all black matte leather court sneaker with clean minimal design")),
  },
  {
    id: 7, slug: "willow-wide-loafer", name: "Willow Wide Loafer", category: "Loafers", heel: "Flat",
    widths: ["Wide"], price: 115, compareAt: null, currency: "USD",
    rating: 4.9, reviewsCount: 734, badge: "Wide Fit",
    fitStats: { small: 4, true: 92, large: 4 },
    sizes: ["36", "37", "38", "39", "40", "41", "42"], oos: [],
    lastCode: "W4",
    desc: "Built on our W4 wide last from day one — not a stretched standard pattern. Roomy toe box, tailored line.",
    features: ["True W4 wide last", "Water-repellent suede", "Orthotic-friendly insole"],
    image: img(SHOT("chestnut brown suede wide loafer with roomy rounded toe")),
  },
  {
    id: 8, slug: "studio-mary-jane", name: "Studio Mary Jane", category: "Heels", heel: "Low",
    widths: ["Standard", "Wide"], price: 102, compareAt: 118, currency: "USD",
    rating: 4.6, reviewsCount: 401, badge: null,
    fitStats: { small: 13, true: 81, large: 6 },
    sizes: ["36", "37", "38", "39", "40", "41"], oos: [],
    lastCode: "H2",
    desc: "A 30mm mary jane in polished calf leather — office-to-dinner with a strap set where the instep needs hold.",
    features: ["30mm stacked heel", "Polished calf leather", "Secure instep strap"],
    image: img(SHOT("black leather mary jane shoe with single strap and low heel")),
  },
  {
    id: 9, slug: "voyage-chelsea-boot", name: "Voyage Chelsea Boot", category: "Boots", heel: "Low",
    widths: ["Standard", "Wide"], price: 148, compareAt: null, currency: "USD",
    rating: 4.8, reviewsCount: 655, badge: "New",
    fitStats: { small: 10, true: 83, large: 7 },
    sizes: ["36", "37", "38", "39", "40", "41", "42"], oos: ["42"],
    lastCode: "B1",
    desc: "A taupe suede chelsea with hand-stitched elastic gores and a 25mm rockered sole for cobblestones.",
    features: ["Water-repellent suede", "Elastic gores", "Rockered 25mm sole"],
    image: img(SHOT("taupe suede chelsea boot with elastic side panel and low stacked sole")),
  },
  {
    id: 10, slug: "haven-wool-mule", name: "Haven Wool Mule", category: "Slippers", heel: "Flat",
    widths: ["Standard", "Wide"], price: 68, compareAt: null, currency: "USD",
    rating: 4.7, reviewsCount: 1022, badge: null,
    fitStats: { small: 15, true: 79, large: 6 },
    sizes: ["36", "37", "38", "39", "40", "41"], oos: [],
    lastCode: "F2",
    desc: "Merino-wool slipper mule with a suede outsole that grips hardwood and folds flat for travel.",
    features: ["Merino wool upper", "Suede non-slip outsole", "Travel-flat design"],
    image: img(SHOT("cozy cream wool slipper mule with soft rounded shape")),
  },
];
