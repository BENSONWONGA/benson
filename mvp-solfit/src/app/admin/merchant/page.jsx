/**
 * /admin/merchant — 商家操作台（Phase 16 补充 · MVP）
 * 与 baseline/monitoring（只读看板）互补：本页是商家日常操作入口
 * （订单发货 / 库存补货 / 经营速览）。数据由 MerchantConsole 轮询
 * /api/admin/overview；操作走 x-admin-token 门禁（见 merchant 域）。
 */

import MerchantConsole from "@/components/MerchantConsole";

export const metadata = { title: "Merchant console", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function MerchantPage() {
  return (
    <div className="container" style={{ padding: "48px 24px 96px" }}>
      <p className="eyebrow">Merchant operations</p>
      <h1 style={{ fontSize: 36, marginBottom: 8 }}>Merchant console</h1>
      <p className="muted" style={{ marginBottom: 8 }}>
        订单发货（paid → shipped）· 库存矩阵与低码补货 · 经营速览（GMV / 售后 / 缺码）
      </p>
      <MerchantConsole />
    </div>
  );
}
