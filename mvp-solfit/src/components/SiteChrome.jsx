/**
 * components/SiteChrome — 前台外壳（顶栏/公告/页脚/挂件）按路由显隐
 * /admin/* 下不渲染任何前台元素（后台是独立控制台，不共用店面门面）。
 */
"use client";

import { usePathname } from "next/navigation";

export default function SiteChrome({ top, bottom, children }) {
  const pathname = usePathname() || "";
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  if (isAdmin) return <>{children}</>;
  return (
    <>
      {top}
      {children}
      {bottom}
    </>
  );
}
