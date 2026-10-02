/**
 * /admin/merchant — 商家操作台（Phase 16 补充 · MVP）
 * 与 baseline/monitoring（只读看板）互补：本页是商家日常操作入口
 * （订单发货 / 库存补货 / 经营速览）。数据由 MerchantConsole 轮询
 * /api/admin/overview；操作走 x-admin-token 门禁（见 merchant 域）。
 */

import MerchantConsole from "@/components/MerchantConsole";

export const metadata = { title: "商家操作台", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function MerchantPage() {
  return (
    <div className="container" style={{ padding: "48px 24px 96px" }}>
      <p className="eyebrow">商家运营</p>
      <h1 style={{ fontSize: 36, marginBottom: 8 }}>商家操作台</h1>
      <p className="muted" style={{ marginBottom: 8 }}>
        主题模板（10 套 UI 一键换）· 首页装修（文案/主图）· 商品上架与管理 · 订单发货 · 库存补货 ·
        优惠码 · 内容（AI + SEO）· SEO 设置 · 评价审核 · 会员运营
      </p>
      <MerchantConsole />
    </div>
  );
}
