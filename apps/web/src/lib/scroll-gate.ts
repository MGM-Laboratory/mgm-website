/**
 * Module-level lock so the hero's entrance animation and the smooth-scroll
 * provider can agree on "is scrolling allowed right now" without either one
 * owning a reference to the other's GSAP instance.
 */
let locked = false;
const subscribers = new Set<(locked: boolean) => void>();

export function lockScroll() {
  locked = true;
  subscribers.forEach((fn) => fn(true));
}

export function unlockScroll() {
  locked = false;
  subscribers.forEach((fn) => fn(false));
}

export function isScrollLocked() {
  return locked;
}

export function onLockChange(fn: (locked: boolean) => void) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
