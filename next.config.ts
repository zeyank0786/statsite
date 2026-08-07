import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // React's <ViewTransition> for shared-element morphs (avatar -> profile hero)
    // and directional route slides. Browsers without the View Transitions API
    // just navigate normally, so this degrades to today's behaviour.
    viewTransition: true,
  },
  async headers() {
    return [
      {
        // Never let a stale service worker linger on a device — browsers will
        // otherwise serve a cached sw.js and worker updates won't land.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
