/**
 * /admin/merchant — 仪表盘（商家后台首页）
 */
import Dashboard from "@/components/admin/Dashboard";

export const metadata = { title: "仪表盘 — 商家后台", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function Page() {
  return <Dashboard />;
}
