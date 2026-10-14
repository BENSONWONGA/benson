/**
 * components/LogoutButton — 退出登录（Phase 16 客户端小岛）
 * 账户页使用；退出后回首页（购物车等会话数据保留在会话内）
 */

"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="btn btn-outline btn-sm"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        window.dispatchEvent(new Event("solfit:cart"));
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
