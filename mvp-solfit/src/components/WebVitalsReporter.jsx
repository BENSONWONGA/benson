"use client";

/**
 * WebVitalsReporter — RUM 上报（Phase 4，Core Web Vitals 预算的实测数据源）
 * useReportWebVitals 由 Next.js 在浏览器端触发（LCP/FCP/TTFB/INP/CLS）。
 * 走 lib/track 的 analytics scope —— 与所有客户端埋点共用 GDPR 同意过滤
 * （未 granted 的访客不上报，方案文档 §7.4 Cookie 同意管理）。
 *
 * 挂载门控：useReportWebVitals 在服务端/预渲染不可用，浏览器挂载后才启用
 * （Web Vitals 本来就只在浏览器产生）。
 */

import { useEffect, useState } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { track } from "@/lib/track";

function VitalsHook() {
  useReportWebVitals((metric) => {
    track("web_vitals", {
      name: metric.name,
      value: Math.round(metric.value * 100) / 100,
      rating: metric.rating || "unrated",
      metricId: metric.id,
    });
  });
  return null;
}

export default function WebVitalsReporter() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <VitalsHook /> : null;
}
