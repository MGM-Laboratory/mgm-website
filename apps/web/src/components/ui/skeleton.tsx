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

/**
 * Skeleton for a photo frame that has no image yet — fills the frame the
 * image will occupy so the layout never shifts.
 *
 * It overrides the base block's translucency: photo frames sit on tinted
 * card surfaces and the portrait background rather than on white, and at
 * 60% alpha (halved again at the low end of the pulse) the block reads as
 * an empty frame instead of a loading one.
 */
export function PhotoSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn(
        "absolute inset-0 size-full rounded-none bg-[var(--line-strong)] dark:bg-white/15",
        className,
      )}
    />
  );
}
