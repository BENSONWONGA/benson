/**
 * components/CookieConsent — GDPR 同意管理（方案文档 §7.4：第一天做对）
 * granted  → analytics 埋点开启（lib/track.track 过闸）
 * essential→ 仅必要 Cookie（会话/购物车/结算）
 * 未选择前不写任何 analytics 事件
 */

"use client";

import { useEffect, useState } from "react";
import { setConsent, getConsent } from "@/lib/track";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getConsent() === null);
  }, []);

  function choose(value) {
    setConsent(value);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="consent-banner" role="dialog" aria-label="Cookie consent">
      <p>
        We use essential cookies to run your cart and checkout, and analytics cookies to improve fit
        recommendations. See our <a href="/privacy" style={{ textDecoration: "underline" }}>Privacy Policy</a>.
      </p>
      <div className="consent-actions">
        <button className="btn btn-outline btn-sm" onClick={() => choose("essential")}>Essential only</button>
        <button className="btn btn-primary btn-sm" onClick={() => choose("granted")}>Accept all</button>
      </div>
    </div>
  );
}
