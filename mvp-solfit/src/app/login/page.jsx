import AuthForm from "@/components/AuthForm";

/**
 * /login — 登录与注册（Phase 16）
 * SEO: noindex（含账户操作的个人页不参与搜索索引）
 */
export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <div className="container section">
      <AuthForm />
    </div>
  );
}
