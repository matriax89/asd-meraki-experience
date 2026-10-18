import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  async headers() {
    const privateHeaders = [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    return [
      { source: "/:locale/biglietto/:path*", headers: privateHeaders },
      { source: "/:locale/pagamento", headers: privateHeaders },
      { source: "/:locale/biglietti", headers: privateHeaders },
      { source: "/api/tickets/:path*", headers: privateHeaders },
      { source: "/api/commerce/:path*", headers: privateHeaders },
      { source: "/api/marketing/:path*", headers: privateHeaders },
      { source: "/:locale/profilo/preferenze", headers: privateHeaders },
      { source: "/:locale/admin/:path*", headers: privateHeaders },
      { source: "/api/checkout/:path*", headers: privateHeaders },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
      },
      {
        protocol: 'https',
        hostname: '**', // Allow any other URL just in case for direttivo avatars
      }
    ],
  },
};

export default withNextIntl(nextConfig);
