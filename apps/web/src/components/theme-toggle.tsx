"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

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

  if (!mounted) {
    return <div className={cn("size-9", className)} aria-hidden />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      // Colours come from the site header (globals.css, .header-control):
      // the header ink, its hover wash and its focus ring, so the toggle
      // follows a project page's theme. The outline is the ink at 15%.
      className={cn(
        "header-control inline-flex size-9 items-center justify-center rounded-full border border-current/15",
        className,
      )}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
