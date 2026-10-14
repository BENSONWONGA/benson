import ProductsPage from "@/components/admin/ProductsPage";

export const metadata = { title: "商品管理 — 商家后台", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function Page() {
  return <ProductsPage />;
}
