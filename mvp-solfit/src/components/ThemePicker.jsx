/**
 * components/ThemePicker — 首页 UI 模板选择器（10 套主题 · cookie 持久化）
 * 色卡 + 名称；点击写 solfit_theme 后整页刷新（layout SSR 重新注入变量覆盖）。
 */

"use client";

import { useEffect, useState } from "react";
import { THEMES } from "@/lib/themes";

export default function ThemePicker({ labels }) {
  const [cur, setCur] = useState("solfit");

  useEffect(() => {
    const m = document.cookie.match(/solfit_theme=(\w+)/);
    if (m) setCur(m[1]);
  }, []);

  function pick(id) {
    document.cookie = "solfit_theme=" + id + ";path=/;max-age=31536000;samesite=lax";
    location.reload();
  }

  return (
    <div>
      <div className="eyebrow">{labels.eyebrow}</div>
      <h2 style={{ marginBottom: 6 }}>{labels.title}</h2>
      <p className="muted" style={{ marginBottom: 18 }}>{labels.hint}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => pick(t.id)}
            className={"chip" + (cur === t.id ? " active" : "")}
            style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, padding: "7px 13px" }}
            title={t.label}
          >
            <span
              aria-hidden
              style={{
                width: 14, height: 14, borderRadius: 999, display: "inline-block",
                background: t.swatch,
                boxShadow: t.dark ? "inset 0 0 0 2px rgba(255,255,255,0.35)" : "inset 0 0 0 1px rgba(0,0,0,0.15)",
              }}
            />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
