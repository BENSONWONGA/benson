import BrandingPage from "@/components/admin/BrandingPage";

export const metadata = { title: "品牌装修 — 商家后台", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function Page() {
  return <BrandingPage />;
}
