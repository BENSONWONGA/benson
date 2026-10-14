import PromosPage from "@/components/admin/PromosPage";

export const metadata = { title: "优惠码 — 商家后台", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function Page() {
  return <PromosPage />;
}
