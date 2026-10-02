/**
 * modules/shipping — 物流域（跨境基建 · 方案文档 §7.2）
 * 分区 → 方法 → 运费 → 追踪号（桩）。
 * 路线：专线小包（Phase 1）→ 爆款海外仓（Phase 2）→ 本地退货仓（Phase 2）。
 * TODO(Phase 1 后半): 接云途/燕文等专线商下单 API，拿真实运单号与轨迹
 */

export const FREE_SHIPPING_THRESHOLD_USD = 120;

export const SHIPPING_METHODS = [
  { id: "us-express", zone: "US", name: "Express — 3–5 days", price: 12.9 },
  { id: "us-standard", zone: "US", name: "Standard — 5–8 days", price: 6.9 },
  { id: "eu-express", zone: "EU", name: "Express — 4–6 days", price: 14.9 },
  { id: "eu-standard", zone: "EU", name: "Standard — 7–12 days", price: 7.9 },
  { id: "uk-express", zone: "UK", name: "Express — 4–6 days", price: 13.9 },
  { id: "row-standard", zone: "ROW", name: "Standard — 10–18 days", price: 19.9 },
];

const COUNTRY_ZONE = {
  US: "US", CA: "ROW", MX: "ROW",
  GB: "UK",
  DE: "EU", FR: "EU", NL: "EU", ES: "EU", IT: "EU", IE: "EU", BE: "EU", SE: "EU", DK: "EU",
  AU: "ROW", JP: "ROW", SG: "ROW",
};

export function zoneFor(country) {
  return COUNTRY_ZONE[String(country || "").toUpperCase()] || "ROW";
}

/** 目的国可用的配送方式（Express 在免邮门槛之上免费 —— 方案 §7.2） */
export function methodsFor(country, subtotalUSD) {
  const zone = zoneFor(country);
  return SHIPPING_METHODS
    .filter((m) => m.zone === zone)
    .map((m) => ({
      ...m,
      free: m.id.endsWith("express") && subtotalUSD >= FREE_SHIPPING_THRESHOLD_USD,
      finalPrice: m.id.endsWith("express") && subtotalUSD >= FREE_SHIPPING_THRESHOLD_USD ? 0 : m.price,
    }));
}

export function getMethod(methodId) {
  return SHIPPING_METHODS.find((m) => m.id === methodId) || null;
}

/** 追踪号桩 —— 接物流商 API 后返回真实运单 */
export function issueTrackingNumber() {
  return "SF" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}
