/**
 * modules/tax — 税务域（跨境基建 · 方案文档 §7.4）
 * 骨架：按目的国的简化税率表做 DDP 预估（下单前透明展示 —— 转化关键）。
 * TODO(Phase 1 后半): 接 Avalara / Stripe Tax 做精确计算
 *   - US: 按收货州 nexus 精确 sales tax（骨架用 8.85% 均值估算）
 *   - EU: IOSS 编号下 ≤€150 单 VAT 由平台代扣代缴（>€150 单走传统清关）
 *   - UK: UKCA + VAT 20%
 */

const COUNTRY_TAX = {
  US: { type: "sales_tax", rate: 0.0885, label: "Sales tax (est.)" },
  GB: { type: "vat", rate: 0.20, label: "UK VAT" },
  DE: { type: "vat", rate: 0.19, label: "VAT (DE / IOSS)" },
  FR: { type: "vat", rate: 0.20, label: "VAT (FR / IOSS)" },
  NL: { type: "vat", rate: 0.21, label: "VAT (NL / IOSS)" },
  ES: { type: "vat", rate: 0.21, label: "VAT (ES / IOSS)" },
  IT: { type: "vat", rate: 0.22, label: "VAT (IT / IOSS)" },
  CA: { type: "duty", rate: 0.05, label: "Duties (est.)" },
  AU: { type: "duty", rate: 0.05, label: "Duties & GST (est.)" },
  ROW: { type: "duty", rate: 0.05, label: "Duties (est.)" },
};

const CENTS = (n) => Math.round(n * 100) / 100;

/** 税费预估：基数 = 商品小计 + 运费（VAT 区运费应税） */
export function quoteTax(country, subtotalUSD, shippingUSD) {
  const rule = COUNTRY_TAX[String(country || "").toUpperCase()] || COUNTRY_TAX.ROW;
  const base = subtotalUSD + shippingUSD;
  return {
    country: String(country || "").toUpperCase() || "ROW",
    type: rule.type,
    label: rule.label,
    rate: rule.rate,
    amount: CENTS(base * rule.rate),
    base: CENTS(base),
    provider: "skeleton-table", // TODO: "avalara" | "stripe-tax"
  };
}
