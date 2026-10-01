"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { isThemeLocked, useThemeLock } from "@/lib/theme-lock";
import { runThemeSwitch } from "@/lib/theme-switch";
import { cn } from "@/lib/utils";

function subscribeNoop() {
  return () => {};
}

// Avoids a hydration mismatch: the server always renders `false`, and the
// client swaps to `true` on first paint, without needing a setState-in-effect.
function useMounted() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const lock = useThemeLock();

  if (!mounted) {
    return <div className={cn("size-9", className)} aria-hidden />;
  }

  const isDark = resolvedTheme === "dark";
  // Held by a page that can't switch colours mid-scene (lib/theme-lock.ts).
  // It stays focusable and says why instead of vanishing from the header.
  const lockedLabel = lock.locked ? `Theme switching is paused. ${lock.reason ?? ""}`.trim() : null;

  return (
    <button
      type="button"
      aria-disabled={lock.locked || undefined}
      data-theme-locked={lock.locked ? "" : undefined}
      title={lockedLabel ?? undefined}
      onClick={(event) => {
        if (isThemeLocked()) {
          event.currentTarget.animate(
            [
              { transform: "translateX(0)" },
              { transform: "translateX(-3px)" },
              { transform: "translateX(3px)" },
              { transform: "translateX(0)" },
            ],
            { duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260 },
          );
          return;
        }
        const next = isDark ? "light" : "dark";
        const rect = event.currentTarget.getBoundingClientRect();
        const request = {
          next,
          origin: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
          commit: () => {
            setTheme(next);
          },
        } as const;
        // A page may stage the switch (the articles library plays a wave
        // from here); otherwise it applies at once.
        if (!runThemeSwitch(request)) request.commit();
      }}
      aria-label={lockedLabel ?? "Toggle theme"}
      // Colours come from the site header (globals.css, .header-control):
      // the header ink, its hover wash and its focus ring, so the toggle
      // follows a project page's theme. The outline is the ink at 15%.
      className={cn(
        "header-control inline-flex size-9 items-center justify-center rounded-full border border-current/15 transition-opacity duration-300 data-[theme-locked]:cursor-not-allowed data-[theme-locked]:opacity-45",
        className,
      )}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
