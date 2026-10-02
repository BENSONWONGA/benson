import ReviewsPage from "@/components/admin/ReviewsPage";

export const metadata = { title: "评价管理 — 商家后台", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function Page() {
  return <ReviewsPage />;
}
