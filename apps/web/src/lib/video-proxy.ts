import { NextResponse } from "next/server";

import { cmsApi } from "@/lib/cms-api";

type KeyContext = { params: Promise<{ key: string }> };

type PlaybackOptions = {
  /**
   * The response's cache policy. Defaults to revalidating on every play. A
   * collection whose keys are minted once per upload (a replaced video gets a
   * new key, the old one stops resolving) can let browsers keep the bytes.
   */
  cacheControl?: string;
};

/** For uuid-keyed uploads: the bytes behind a key never change. */
export const IMMUTABLE_VIDEO_CACHE = "public, max-age=31536000, immutable";

/**
 * A public, range-seekable video-playback proxy: relays Range requests to
 * storage and streams the 206 response back, so a player can seek without
 * downloading the whole file. Shared by every CMS collection with an
 * uploadable video (projects' per-record demo video, home's singleton
 * video, …) so a new route doesn't re-spell this closely enough to be
 * flagged as a clone of an existing one.
 */
export function videoPlaybackRoute(
  keyPattern: RegExp,
  cmsPath: (key: string) => string,
  { cacheControl = "private, no-cache" }: PlaybackOptions = {},
) {
  return {
    async GET(request: Request, { params }: KeyContext) {
      const { key } = await params;
      if (!keyPattern.test(key)) return new NextResponse(null, { status: 404 });

      const response = await cmsApi(cmsPath(key), { redirect: "manual" });
      const location = response.headers.get("location");
      if (!location) return new NextResponse(null, { status: response.status || 502 });

      const range = request.headers.get("range");
      const source = await fetch(location, {
        cache: "no-store",
        headers: range ? { range } : {},
      });
      if (!source.ok || !source.body) return new NextResponse(null, { status: source.status });

      const headers = new Headers({
        "accept-ranges": "bytes",
        "cache-control": cacheControl,
        "content-type":
          source.headers.get("content-type") ??
          (key.endsWith(".webm") ? "video/webm" : "video/mp4"),
        "x-content-type-options": "nosniff",
      });
      const contentRange = source.headers.get("content-range");
      const contentLength = source.headers.get("content-length");
      if (contentRange) headers.set("content-range", contentRange);
      if (contentLength) headers.set("content-length", contentLength);
      for (const name of ["etag", "last-modified"]) {
        const value = source.headers.get(name);
        if (value) headers.set(name, value);
      }
      return new NextResponse(source.body, { headers, status: range ? source.status : 200 });
    },
  };
}
