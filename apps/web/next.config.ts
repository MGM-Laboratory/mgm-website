// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import path from "node:path";
import type { NextConfig } from "next";

/**
 * The API origin that the browser calls (the contact form posts there), read from the same variable that the build bakes into the
 * client code.
 */
function apiOrigin() {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api").origin;
  } catch {
    return null;
  }
}

/**
 * A Content-Security-Policy that only reports. Nothing is blocked, so a source that the pages need but this list misses shows up as a
 * report in the server log (see /api/csp-report) and not as a broken page. The scripts and styles still allow inline code, because
 * Next writes inline bootstrap scripts, and a nonce policy would make every page render for each request. The list is meant to be read
 * against the reports, tightened, and then sent as an enforced header in a later change. Two directives are left out on purpose until
 * then, `frame-ancestors`, because the public forms are meant to be embedded on other sites, and `form-action`, because the short link
 * gate posts to this site and is answered with a redirect to another site.
 */
function contentSecurityPolicy() {
  const api = [apiOrigin()].filter((value): value is string => Boolean(value));
  const connect = ["'self'", ...api];
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src ${["'self'", "data:", "blob:", "https:", ...api].join(" ")}`,
    `media-src ${["'self'", "blob:", "https:", ...api].join(" ")}`,
    `connect-src ${connect.join(" ")}`,
    "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "report-uri /api/csp-report",
  ].join("; ");
}

/** Matches every path except `/forms/...`, the pages that other sites embed. */
export const FRAME_PROTECTED_SOURCE = "/((?!forms/).*)";

const nextConfig: NextConfig = {
  output: "standalone",
  // The image build sets BUILD_ID to the commit, so two builds of one commit give the same build id. Without it Next.js makes a
  // random id on every build.
  generateBuildId: async () => process.env.BUILD_ID || null,
  // The development route indicator obscures interactive UI while reviewing
  // the site locally. Compile and runtime errors remain available in the
  // terminal and browser overlay.
  devIndicators: false,
  images: {
    qualities: [75, 88],
  },
  async headers() {
    return [
      // Only the production build sends them. The dev server needs a websocket and inline eval that the policy would report all day, and it runs over plain HTTP, where HSTS does nothing
      ...(process.env.NODE_ENV === "production"
        ? [
            {
              source: "/:path*",
              headers: [
                {
                  key: "Content-Security-Policy-Report-Only",
                  value: contentSecurityPolicy(),
                },
                { key: "X-Content-Type-Options", value: "nosniff" },
                // One year, and no includeSubDomains, because other hosts of the lab may not all serve HTTPS
                { key: "Strict-Transport-Security", value: "max-age=31536000" },
              ],
            },
            // Every page except the public forms refuses to sit in a frame of another site. The forms are meant to be embedded
            {
              source: FRAME_PROTECTED_SOURCE,
              headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
            },
          ]
        : []),
      {
        source: "/members/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/member.png",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/patterns/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/logo/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
  // Trace files from the monorepo root so workspace packages (e.g. @repo/shared)
  // are included in the standalone build output.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
