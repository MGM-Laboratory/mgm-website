// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { RouteLoadingSentinel } from "@/components/transition/route-loading-sentinel";

/** Transparent like the list's: the world stays on screen while the article loads. */
export default function ArticleDetailLoading() {
  return <RouteLoadingSentinel />;
}
