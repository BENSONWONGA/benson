/**
 * /cart — 购物车页（服务端壳 + 客户端岛）
 */

import { cookies } from "next/headers";
import { getCurrencyFromCookies } from "@/lib/currency";
import CartClient from "@/components/CartClient";

export const metadata = { title: "Your cart" };
export const dynamic = "force-dynamic"; // cookies() 动态渲染

export default function CartPage() {
  const currency = getCurrencyFromCookies(cookies());
  return (
    <div className="container" style={{ padding: "40px 24px 80px" }}>
      <div className="eyebrow">Step 1 of 3</div>
      <h1 style={{ fontSize: 36, marginBottom: 24 }}>Your cart</h1>
      <CartClient currency={currency} />
    </div>
  );
}
