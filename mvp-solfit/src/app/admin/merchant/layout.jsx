/**
 * app/admin/merchant/layout.jsx — 商家后台完整版布局
 * 侧边栏壳 + 专属 admin.css（独立于前台主题）；/admin/* 路由不渲染前台门面（SiteChrome）。
 */
import "../admin.css";
import AdminShell from "@/components/admin/AdminShell";

export const metadata = { title: "商家后台", robots: { index: false, follow: false } };

export default function MerchantLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
