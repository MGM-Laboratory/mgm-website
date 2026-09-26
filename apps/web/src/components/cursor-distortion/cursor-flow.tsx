"use client";

import "./cursor-flow.css";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

import { cursorFlow, retainCursorFlow } from "@/components/cursor-distortion/flow-controller";

/**
 * The site's cursor flow: a WebGL paint field behind the page that the
 * cursor drags like wet paint, with a thin iridescent sheen on its tail
 * (flow-engine.ts). Text and every DOM element stay crisp above it.
 *
 * Mounted once by the smooth-scroll shell on every public route. `active`
 * is false on routes that draw a cursor effect of their own (a project
 * page, the articles library): the stage hides there and comes back on the
 * next route that wants it. Renders nothing itself: the engine appends its
 * canvas to <body>, under the page.
 *
 * Layout effects, so showing, hiding and the new page's surfaces land in
 * the same commit as the route change.
 */
export function CursorFlow({ active }: { active: boolean }) {
  const pathname = usePathname();

  useLayoutEffect(() => retainCursorFlow(), []);

  useLayoutEffect(() => {
    cursorFlow()?.setActive(active);
  }, [active]);

  useLayoutEffect(() => {
    cursorFlow()?.routeChanged();
  }, [pathname]);

  return null;
}
