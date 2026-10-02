/**
 * components/ProductGallery — 商品详情页媒体区（主图 + 详图画廊）
 * 无详图时保持原样单主图（零成本）；有详图时点缩略图切换大图。
 */
"use client";

import { useState } from "react";

export default function ProductGallery({ main, images = [], alt }) {
  const all = [main, ...images.filter(Boolean)].filter(Boolean);
  const [cur, setCur] = useState(main || "");

  if (!all.length) {
    return <div className="pdp-main-img" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}><span className="muted">No image</span></div>;
  }
  if (all.length === 1) {
    return <img className="pdp-main-img" src={all[0]} alt={alt} />;
  }
  return (
    <div>
      <img className="pdp-main-img" src={cur} alt={alt} />
      <div className="pdp-thumbs">
        {all.map((src, i) => (
          <button
            key={i}
            type="button"
            className={`pdp-thumb${src === cur ? " active" : ""}`}
            onClick={() => setCur(src)}
            aria-label={`${alt} 图 ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" />
          </button>
        ))}
      </div>
    </div>
  );
}
