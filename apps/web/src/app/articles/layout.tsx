import { ArticlesTransitionsHost } from "@/components/articles/transitions/articles-transitions-host";
import { ArticlesWorldHost } from "@/components/articles/world/world-host";

import "./articles.css";
import "./world.css";
import "./detail.css";
import "./transitions.css";

/**
 * Every articles route lives inside the library world. The host comes
 * before the page on purpose: its layout effects then run first, so a
 * page's own layout effects (a scroll restore on return) always win.
 * The layout fetches nothing: it must never hold up a navigation.
 *
 * `data-articles-library` marks the library for CSS for as long as any
 * articles route is on screen (world.css clears the site header's glass
 * over it), from the first server paint and across list and article.
 */
export default function ArticlesLayout({ children }: LayoutProps<"/articles">) {
  return (
    <>
      <span data-articles-library="" hidden />
      <ArticlesWorldHost />
      <ArticlesTransitionsHost />
      {children}
    </>
  );
}
