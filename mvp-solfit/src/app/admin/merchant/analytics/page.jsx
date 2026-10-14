import AnalyticsPage from "@/components/admin/AnalyticsPage";

export const metadata = { title: "数据分析 — 商家后台", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function Page() {
  return <AnalyticsPage />;
}
