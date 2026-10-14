/**
 * app/embed/size-finder — 嵌入式尺码组件页（宿主站 iframe 目标）
 *
 * "24 小时接入"口径：第三方商品页插一行 iframe 即获得尺码推荐能力。
 * noindex：组件页不参与搜索索引（SEO 资产归宿主站，我们提供体验）。
 *
 * 骨架期隐藏站点装饰的做法：root layout 套了全站 header/footer，
 * 本页注入少量 CSS 隐藏之（Phase 2 换 middleware 按路径跳过装饰层，
 * 或迁独立渲染管线 —— 接口不变）。
 */

import EmbedFinder from "@/components/EmbedFinder";

export const metadata = { title: "Size Finder", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function EmbedSizeFinderPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .announce, .site-header, .site-footer, .cookie-consent, .stylist-chat, .toast-layer { display: none !important; }
        body { background: transparent; }
        main { padding: 0 !important; }
      `}} />
      <EmbedFinder />
    </>
  );
}
