import type { ReactNode } from "react";
import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A fake browser-window chrome — traffic-light dots, a padlocked address
 * bar, then whatever content the section wants. The dots reuse the closed
 * brand palette (red/yellow/green) purely as decoration, same as the
 * footer's pattern mosaic already does; nothing here carries new meaning
 * beyond "this is a window."
 */
export function MonitorWindow({
  url,
  dark = false,
  className,
  children,
}: Readonly<{
  url: string;
  dark?: boolean;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border",
        dark
          ? "border-white/10 bg-black/30"
          : "border-[var(--line)] bg-background shadow-lg shadow-black/[0.04]",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 border-b px-4 py-2.5",
          dark
            ? "border-white/10 bg-white/[0.03]"
            : "border-[var(--line)] bg-black/[0.025] dark:bg-white/[0.04]",
        )}
      >
        <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-brand-red" />
          <span className="size-2.5 rounded-full bg-brand-yellow" />
          <span className="size-2.5 rounded-full bg-brand-green" />
        </div>
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-md px-2.5 py-1 font-mono text-xs",
            dark ? "bg-white/[0.06] text-white/50" : "bg-background text-foreground/45",
          )}
        >
          <Lock className="size-3 shrink-0" strokeWidth={2.25} />
          <span className="truncate">{url}</span>
        </div>
      </div>
      {children}
    </div>
  );
}
