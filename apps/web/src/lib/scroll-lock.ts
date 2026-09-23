import { ScrollSmoother } from "gsap/ScrollSmoother";

/**
 * One shared, owner-counted page scroll lock. Several features lock the
 * page independently (the nav menu, the /projects intro), and each used to
 * write `html { overflow }` directly, so one feature unlocking cleared a
 * lock another still needed (open and close the menu mid-intro, and the
 * intro's lock was gone). Here the page stays locked while ANY owner holds
 * it, and unlocks only once the last owner releases.
 *
 * `overflow: hidden` alone doesn't stop programmatic scrolling, so a
 * JS-driven scroller (ScrollSmoother on the homepage, the /projects smooth
 * scroller) must also pause: ScrollSmoother is paused here directly, and
 * any other scroller subscribes through onScrollLockChange.
 */

const owners = new Set<string>();
const listeners = new Set<(locked: boolean) => void>();

function apply(locked: boolean) {
  const html = document.documentElement;
  html.style.overflow = locked ? "hidden" : "";
  // Hiding a classic (non-overlay) scrollbar would widen the page by its
  // width and shift every right-anchored element; keep its gutter reserved
  // while locked so nothing moves on lock or unlock.
  html.style.scrollbarGutter = locked ? "stable" : "";
  ScrollSmoother.get()?.paused(locked);
  for (const listener of listeners) listener(locked);
}

/** Locks page scrolling on behalf of `owner` (idempotent per owner). */
export function acquireScrollLock(owner: string) {
  if (owners.has(owner)) return;
  owners.add(owner);
  if (owners.size === 1) apply(true);
}

/** Drops `owner`'s hold; the page unlocks once no owner holds it. */
export function releaseScrollLock(owner: string) {
  if (!owners.delete(owner)) return;
  if (owners.size === 0) apply(false);
}

export function isScrollLocked() {
  return owners.size > 0;
}

/** Subscribes to lock/unlock transitions; returns the unsubscribe function. */
export function onScrollLockChange(listener: (locked: boolean) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
