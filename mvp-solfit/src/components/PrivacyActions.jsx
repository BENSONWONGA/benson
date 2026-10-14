/**
 * components/PrivacyActions — GDPR 权利操作（导出/删除）
 * erase 同时清理客户端 localStorage —— 服务端与浏览器两侧同步删除
 */

"use client";

import { useState } from "react";
import { setConsent } from "@/lib/track";

export default function PrivacyActions() {
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function erase() {
    if (!confirm("Erase all data tied to this session (fit profile, cart)? Orders remain as anonymized financial records.")) return;
    setBusy(true);
    const res = await fetch("/api/privacy/erase", { method: "POST" });
    const json = await res.json();
    setBusy(false);
    if (json.code === 0) {
      try {
        localStorage.clear(); // 客户端侧：脚型缓存 / 同意状态一并清理
      } catch {}
      setMessage("Erased. Analytics consent has also been reset.");
    }
  }

  return (
    <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <a className="btn btn-outline" href="/api/privacy/export" download="solfit-data.json">Export my data</a>
      <button className="btn btn-outline" onClick={erase} disabled={busy}>{busy ? "Erasing…" : "Erase my data"}</button>
      {message ? <p className="muted" style={{ width: "100%" }}>{message}</p> : null}
    </div>
  );
}
