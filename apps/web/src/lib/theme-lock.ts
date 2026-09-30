import { useSyncExternalStore } from "react";

/**
 * Lets a page hold the light/dark toggle still while something on it cannot
 * change colours halfway through (the homepage story: its WebGL scenes build
 * their palettes when they start). Each holder acquires the lock by name and
 * releases it by the same name, so two holders never release each other's
 * hold. The header's toggle reads it through `useThemeLock()`: while held it
 * is `aria-disabled` and says why in its label and tooltip.
 *
 * Only types and a tiny registry live here, so any component can import it.
 */

const holders = new Map<string, string>();
const listeners = new Set<() => void>();
let snapshot: ThemeLockState = { locked: false, reason: null, theme: null };

/**
 * `theme` is the scheme on screen when the lock was first taken ("light" or
 * "dark"). The theme provider forces it while the lock holds, so an OS
 * switch cannot flip the page either.
 */
export type ThemeLockState = Readonly<{
  locked: boolean;
  reason: string | null;
  theme: "light" | "dark" | null;
}>;

function currentScheme(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function publish() {
  const reasons = [...holders.values()];
  const locked = reasons.length > 0;
  const theme = locked ? (snapshot.theme ?? currentScheme()) : null;
  snapshot = { locked, reason: reasons.at(-1) ?? null, theme };
  for (const listener of [...listeners]) listener();
}

/**
 * Holds the toggle for `owner` until the returned release runs (or
 * `releaseThemeLock(owner)`). Acquiring again under the same owner only
 * updates its reason.
 */
export function acquireThemeLock(owner: string, reason: string) {
  const had = holders.get(owner);
  holders.set(owner, reason);
  if (had !== reason) publish();
  return () => {
    releaseThemeLock(owner);
  };
}

export function releaseThemeLock(owner: string) {
  if (holders.delete(owner)) publish();
}

export function isThemeLocked() {
  return snapshot.locked;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const unlocked: ThemeLockState = { locked: false, reason: null, theme: null };

/** The live lock state; the server and the first client render read it as unlocked. */
export function useThemeLock(): ThemeLockState {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => unlocked,
  );
}
