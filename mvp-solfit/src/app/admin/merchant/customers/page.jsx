import CustomersPage from "@/components/admin/CustomersPage";

export const metadata = { title: "会员管理 — 商家后台", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function Page() {
  return <CustomersPage />;
}
