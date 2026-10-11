import AiMarketingPage from "@/components/admin/AiMarketingPage";

export const metadata = { title: "AI 营销 — 商家后台", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function Page() {
  return <AiMarketingPage />;
}
