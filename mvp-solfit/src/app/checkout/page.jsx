/**
 * /checkout — 结算页（三步：地址/配送/支付）
 * 金额全部服务端计算（/api/checkout），前端只做展示与状态机
 */

import { cookies } from "next/headers";
import { getCurrencyFromCookies } from "@/lib/currency";
import CheckoutClient from "@/components/CheckoutClient";

export const metadata = { title: "Checkout" };
export const dynamic = "force-dynamic"; // cookies() 动态渲染

export default function CheckoutPage() {
  const currency = getCurrencyFromCookies(cookies());
  return (
    <div className="container" style={{ padding: "40px 24px 80px" }}>
      <div className="eyebrow">Step 2 of 3</div>
      <h1 style={{ fontSize: 36, marginBottom: 24 }}>Checkout</h1>
      <CheckoutClient currency={currency} />
    </div>
  );
}
