import OrdersPage from "@/components/admin/OrdersPage";

export const metadata = { title: "订单管理 — 商家后台", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function Page() {
  return <OrdersPage />;
}
