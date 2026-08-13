import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(), browsing-topics=()"
          }
        ]
      }
    ];
  }
};

export default withSentryConfig(nextConfig, {
  org: "talent7",
  project: "javascript-nextjs",
  silent: true,
  telemetry: false,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN
  },
  treeshake: {
    removeDebugLogging: true,
    excludeReplayIframe: true,
    excludeReplayShadowDOM: true,
    excludeReplayCompressionWorker: true
  }
});
