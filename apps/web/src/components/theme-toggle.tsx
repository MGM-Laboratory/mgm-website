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
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full border border-black/10 bg-background text-foreground transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10",
        className,
      )}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
