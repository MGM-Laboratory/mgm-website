// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { bundledMediaPath, mediaPlaybackRoute } from "@/lib/cms-media-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { GET } = mediaPlaybackRoute(
  (key) => `/cms/articles/media/${encodeURIComponent(key)}`,
  { staticAssetPath: bundledMediaPath },
);
