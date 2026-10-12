import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.REGISTRATION_TEST_DIST_DIR ?? ".next",
  async headers() {
    const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : "https://*.supabase.co";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' ${process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace("https:", "wss:").replace("http:", "ws:")} https://challenges.cloudflare.com`,
      "frame-src https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "motion",
      "embla-carousel-react",
      "embla-carousel-autoplay",
      "@radix-ui/react-dropdown-menu",
    ],
  },
};

export default nextConfig;
