/** @type {import('next').NextConfig} */
const nextConfig = {
  // Phase 4：instrumentation.js 启动钩子（告警评估器）
  experimental: { instrumentationHook: true },
  // 跨境独立站：图片走远端 CDN/生成服务，域名运行时可配
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "trae-api-cn.mchost.guru" },
      { protocol: "https", hostname: "cdn.solfit.example" },
    ],
  },
};

export default nextConfig;
