import path from "node:path";
import type { NextConfig } from "next";

/**
 * The API origin that the browser calls (the contact form posts there), read from the same variable that the build bakes into the
 * client code.
 */
function apiOrigin() {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api").origin;
  } catch {
    return null;
  }
}

/**
 * A Content-Security-Policy that only reports. Nothing is blocked, so a source that the pages need but this list misses shows up as a
 * report in the server log (see /api/csp-report) and not as a broken page. The scripts and styles still allow inline code, because
 * Next writes inline bootstrap scripts, and a nonce policy would make every page render for each request. The list is meant to be read
 * against the reports, tightened, and then sent as an enforced header in a later change.
 */
function contentSecurityPolicy() {
  const connect = ["'self'", apiOrigin()].filter((value): value is string => Boolean(value));
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    `connect-src ${connect.join(" ")}`,
    "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "report-uri /api/csp-report",
  ].join("; ");
}

const nextConfig: NextConfig = {
  output: "standalone",
  // The development route indicator obscures interactive UI while reviewing
  // the site locally. Compile and runtime errors remain available in the
  // terminal and browser overlay.
  devIndicators: false,
  images: {
    qualities: [75, 88],
  },
  async headers() {
    return [
      // Only the production build sends it, because the dev server needs a websocket and inline eval that the policy would report all day
      ...(process.env.NODE_ENV === "production"
        ? [
            {
              source: "/:path*",
              headers: [
                {
                  key: "Content-Security-Policy-Report-Only",
                  value: contentSecurityPolicy(),
                },
              ],
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
