import { SITE_HEADER_HEIGHT } from "@/components/site-header";

/**
 * Viewport triggers for the card text effects, shared by every card: one
 * IntersectionObserver per trigger kind instead of two per card. (No
 * ScrollTrigger here: per-card triggers on a page that can load already
 * scrolled are the crash shape docs/animation-system.md warns about, and
 * an IntersectionObserver reports the current state as soon as it starts
 * observing, so cards already in view need no catch-up logic.)
 */

type Listener = (inView: boolean) => void;

function createTrigger(rootMargin: string) {
  const listeners = new Map<Element, Listener>();
  let observer: IntersectionObserver | null = null;

  return (element: Element, listener: Listener) => {
    observer ??= new IntersectionObserver(
      (entries) => {
        for (const entry of entries) listeners.get(entry.target)?.(entry.isIntersecting);
      },
      { rootMargin },
    );
    listeners.set(element, listener);
    // Re-observing forces a fresh initial report for the new listener.
    observer.unobserve(element);
    observer.observe(element);
    return () => {
      if (listeners.get(element) !== listener) return;
      listeners.delete(element);
      observer?.unobserve(element);
      if (!listeners.size) {
        observer?.disconnect();
        observer = null;
      }
    };
  };
}

/**
 * Reports whether any part of `element` is visible below the fixed site
 * header (a strip hidden under the header doesn't count as seen).
 */
export const observeSeen = createTrigger(`-${SITE_HEADER_HEIGHT}px 0px 0px 0px`);

/** Reports whether any part of `element` is inside the viewport. */
export const observeInViewport = createTrigger("0px");
