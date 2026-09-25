import { onWorldState } from "@/components/articles/world/world-registry";

/**
 * The DOM list's own reveal (no world: reduced motion, no hardware WebGL2,
 * `?noworld`): each card fades and rises as it enters the viewport, the ones
 * arriving together a beat apart. Plain CSS transitions keyed on the slot's
 * `data-reveal` (articles.css), set from an IntersectionObserver; nothing
 * here touches a transform GSAP owns.
 *
 * `instant` marks every card revealed without motion (a return from an
 * article: the list is as it was left). Returns the stop function.
 */
export function startDomReveal(grid: HTMLElement, options: { instant: boolean }) {
  let observer: IntersectionObserver | null = null;
  let mutations: MutationObserver | null = null;

  const showAll = () => {
    for (const slot of grid.querySelectorAll<HTMLElement>("[data-article-slot]")) {
      slot.dataset.reveal = "shown";
    }
  };

  const watch = () => {
    observer = new IntersectionObserver(
      (entries) => {
        let order = 0;
        const arriving = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top ||
              a.boundingClientRect.left - b.boundingClientRect.left,
          );
        for (const entry of arriving) {
          const slot = entry.target as HTMLElement;
          slot.style.setProperty("--reveal-delay", `${Math.min(order, 6) * 70}ms`);
          slot.dataset.reveal = "shown";
          observer?.unobserve(slot);
          order += 1;
        }
      },
      { rootMargin: "0px 0px -4% 0px", threshold: 0.06 },
    );
    const observe = () => {
      for (const slot of grid.querySelectorAll<HTMLElement>(
        "[data-article-slot]:not([data-reveal])",
      )) {
        observer?.observe(slot);
      }
    };
    observe();
    // New batches (and a filter's new list) join as they mount.
    mutations = new MutationObserver(observe);
    mutations.observe(grid, { childList: true });
  };

  const stop = () => {
    observer?.disconnect();
    mutations?.disconnect();
    observer = null;
    mutations = null;
  };

  if (options.instant) {
    grid.dataset.revealInstant = "";
    showAll();
    requestAnimationFrame(() => delete grid.dataset.revealInstant);
  }

  const offWorld = onWorldState((mode) => {
    stop();
    if (mode === "dom") {
      if (options.instant) showAll();
      watch();
    }
  });

  return () => {
    offWorld();
    stop();
  };
}
