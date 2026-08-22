import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  /**
   * Several modules read files whose paths are only known at runtime — the service-account
   * fallback, and the local .data scratch space used by ffmpeg and QC. The tracer cannot follow a
   * dynamic path, so it conservatively pulls the whole project into every serverless function.
   * None of these directories are readable at runtime anyway, so excluding them keeps the bundle
   * to what the functions actually use.
   */
  outputFileTracingExcludes: {
    "*": [
      ".data/**",
      "docs/**",
      "public/showcase/**",
    ],
  },
};

export default nextConfig;
