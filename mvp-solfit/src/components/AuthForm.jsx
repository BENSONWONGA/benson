/**
 * components/AuthForm — 登录/注册表单（Phase 16 客户端小岛）
 * 注册即登录、登录即合并：成功后刷新页面数据（购物车徽标/推荐锚）
 * 并跳转 /account。错误口径与 API 一致（401/409/429/422）。
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ERRORS = {
  INVALID_CREDENTIALS: "Incorrect email or password.",
  USER_EXISTS: "This email is already registered. Sign in instead.",
  WEAK_PASSWORD: "Password must be at least 8 characters.",
  INVALID_EMAIL: "Please enter a valid email address.",
  ACCOUNT_LOCKED: "Too many attempts. Try again in 15 minutes.",
  SESSION_REQUIRED: "Session error. Refresh and try again.",
};

export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const isLogin = mode === "login";

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(isLogin ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isLogin ? { email, password } : { email, password, name }),
      });
      const json = await res.json();
      if (!res.ok || json.code !== 0) {
        setError(ERRORS[json.message] || "Something went wrong. Please try again.");
        return;
      }
      window.dispatchEvent(new Event("solfit:cart")); // 登录合并可能带来新购物车内容
      router.push("/account");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "48px auto 0" }}>
      <p className="eyebrow">{isLogin ? "Welcome back" : "Create account"}</p>
      <h1 style={{ fontSize: 32, margin: "0 0 24px" }}>
        {isLogin ? "Sign in" : "Join SOLFIT"}
      </h1>

      <form className="finder-form" onSubmit={submit}>
        {!isLogin && (
          <div>
            <label htmlFor="auth-name">Name (optional)</label>
            <input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Chen" />
          </div>
        )}
        <div>
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div>
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        </div>
        {error && <p style={{ color: "#C0392B", fontSize: 13, margin: 0 }}>{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="muted" style={{ marginTop: 20 }}>
        {isLogin ? "New here? " : "Already have an account? "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setError(null);
            setMode(isLogin ? "register" : "login");
          }}
        >
          {isLogin ? "Create an account" : "Sign in"}
        </a>
      </p>
      <p className="muted">
        Signing in merges this browser&apos;s bag and wishlist with your account — nothing is lost.
      </p>
    </div>
  );
}
