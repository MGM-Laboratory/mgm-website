import { cn } from "@/lib/utils";

/**
 * Base skeleton block. The pulse is a decorative loop, so it's switched off
 * under reduced motion rather than just slowed down (see
 * docs/animation-system.md's reduced-motion conventions for GSAP loops —
 * same rule applies here even though this one is plain CSS).
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-md bg-[var(--line-strong)]/60 motion-reduce:animate-none dark:bg-white/10",
        className,
      )}
    />
  );
}
