import { useSyncExternalStore } from "react";

import type { ProjectColorScheme } from "@/lib/project-themes";

/**
 * The site's live light or dark mode (next-themes toggles `.dark` on
 * <html>). The server snapshot is "light": use the result for canvases and
 * effects only, never for markup (the page's CSS variables already follow
 * the class on their own).
 */

function subscribe(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function snapshot(): ProjectColorScheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function useSiteScheme(): ProjectColorScheme {
  return useSyncExternalStore(subscribe, snapshot, () => "light");
}
