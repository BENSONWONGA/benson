/**
 * components/LanguageSwitcher — 语言切换（cookie 持久化 + 刷新生效）
 * 骨架期只有首页消费语言（lib/i18n）；Phase 2 locale 路由后全站生效。
 */

"use client";

import { useEffect, useState } from "react";
import { LANGS } from "@/lib/i18n";

export default function LanguageSwitcher() {
  const [lang, setLang] = useState("en");

  useEffect(() => {
    const m = document.cookie.match(/solfit_lang=(\w+)/);
    if (m && m[1] !== lang) setLang(m[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function change(e) {
    document.cookie = "solfit_lang=" + e.target.value + ";path=/;max-age=31536000;samesite=lax";
    location.reload();
  }

  return (
    <select
      aria-label="Language"
      onChange={change}
      value={lang}
      style={{ height: 34, borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", padding: "0 10px", fontSize: 12, fontWeight: 600 }}
    >
      {LANGS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
    </select>
  );
}
