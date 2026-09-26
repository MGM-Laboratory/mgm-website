"use client";

import { LogoMark } from "@/components/hero/shapes";
import { cn } from "@/lib/utils";

/**
 * The slot the footer's highlight lives in: the lab's mark, at a size that
 * never changes, so the text beside it never moves and the mark never
 * covers it.
 */
export function LogoStage({ className }: { className?: string }) {
  return (
    <div data-logo-stage="flat" className={cn("relative aspect-square select-none", className)}>
      <div aria-hidden className="absolute inset-[18%]">
        <LogoMark solid className="h-full w-full" />
      </div>
    </div>
  );
}
