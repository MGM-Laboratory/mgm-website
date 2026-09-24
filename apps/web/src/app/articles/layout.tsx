import { ArticlesWorldHost } from "@/components/articles/world/world-host";

import "./articles.css";

/**
 * Every articles route lives inside the library world. The host comes
 * before the page on purpose: its layout effects then run first, so a
 * page's own layout effects (a scroll restore on return) always win.
 * The layout fetches nothing: it must never hold up a navigation.
 */
export default function ArticlesLayout({ children }: LayoutProps<"/articles">) {
  return (
    <>
      <ArticlesWorldHost />
      {children}
    </>
  );
}
