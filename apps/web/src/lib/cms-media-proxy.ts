import { NextResponse } from "next/server";

import { cmsApi } from "@/lib/cms-api";

type KeyContext = { params: Promise<{ key: string }> };

type MediaRouteOptions = {
  keyPattern?: RegExp;
  staticAssetPath?: (key: string) => string | undefined;
};

const IMMUTABLE_MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * Builds a cacheable public-media route backed by a signed CMS redirect.
 * All media collections share the same streaming and response-header policy;
 * routes only supply their CMS path and any collection-specific key handling.
 */
export function mediaPlaybackRoute(
  cmsPath: (key: string) => string,
  options: MediaRouteOptions = {},
) {
  return {
    async GET(request: Request, { params }: KeyContext) {
      const { key } = await params;
      if (options.keyPattern && !options.keyPattern.test(key)) {
        return new NextResponse(null, { status: 404 });
      }

      const staticPath = options.staticAssetPath?.(key);
      if (staticPath) return NextResponse.redirect(new URL(`/${staticPath}`, request.url));

      const response = await cmsApi(cmsPath(key), { redirect: "manual" });
      const location = response.headers.get("location");
      const source = location ? await fetch(location, { cache: "no-store" }) : response;
      if (!source.ok || !source.body) return new NextResponse(null, { status: source.status });

      const headers = new Headers({
        "cache-control": IMMUTABLE_MEDIA_CACHE_CONTROL,
        "content-type": source.headers.get("content-type") ?? "application/octet-stream",
        "x-content-type-options": "nosniff",
      });
      const contentLength = source.headers.get("content-length");
      if (contentLength) headers.set("content-length", contentLength);
      return new NextResponse(source.body, { headers });
    },
  };
}

export function bundledMediaPath(key: string): string | undefined {
  return key.match(/^static\/([\w-]+\/[\w.-]+)$/)?.[1];
}
