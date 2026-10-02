import InventoryPage from "@/components/admin/InventoryPage";

export const metadata = { title: "库存管理 — 商家后台", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function Page() {
  return <InventoryPage />;
}
