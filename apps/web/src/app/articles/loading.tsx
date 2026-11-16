// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { RouteLoadingSentinel } from "@/components/transition/route-loading-sentinel";

/**
 * Transparent on purpose: the library world stays visible behind a loading
 * articles route (a batch of the CMS, an article's document). The sentinel
 * tells the route curtain and the articles transitions that the page isn't
 * there yet.
 */
export default function ArticlesLoading() {
  return <RouteLoadingSentinel />;
}
