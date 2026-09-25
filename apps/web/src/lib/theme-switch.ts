/**
 * Lets a page stage the light/dark switch the header toggle asks for. The
 * articles library, for one, plays a wave from the toggle across its world
 * and commits the theme partway through. Everywhere else no handler is
 * registered and the toggle switches at once, exactly as before.
 *
 * Contract for a handler: return true only when it will call `commit()`
 * itself, exactly once and within a few hundred milliseconds (the wave may
 * run on after the commit). It must never drop a request: a second click
 * during a wave still commits its own theme. Under reduced motion it should
 * commit immediately or return false.
 */

export type ThemeName = "light" | "dark";

export type ThemeSwitchRequest = {
  next: ThemeName;
  /** Where the switch was asked from, in viewport CSS px (the toggle's centre). */
  origin: { x: number; y: number };
  /** Applies the theme (next-themes' setTheme). */
  commit: () => void;
};

type ThemeSwitchHandler = (request: ThemeSwitchRequest) => boolean;

const handlers: ThemeSwitchHandler[] = [];

/** Installs a handler (the latest one answers first); returns the uninstall function. */
export function registerThemeSwitchHandler(handler: ThemeSwitchHandler) {
  handlers.push(handler);
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index >= 0) handlers.splice(index, 1);
  };
}

/**
 * Offers the switch to the registered handlers, newest first. Returns false
 * when none took it, in which case the caller commits the theme itself.
 */
export function runThemeSwitch(request: ThemeSwitchRequest) {
  for (let index = handlers.length - 1; index >= 0; index -= 1) {
    if (handlers[index](request)) return true;
  }
  return false;
}
