"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Magnetic } from "./magnetic";

/**
 * The sections' "see all" link: a label and a round arrow chip, pulled
 * toward a nearby cursor. On hover the chip fills with brand blue while its
 * arrow flies out to the right and a fresh one slides in from the left.
 * Reduced motion keeps the colour change and drops the travel.
 */
export function SeeMoreLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Magnetic className={cn("-ml-2 shrink-0", className)} radius={60} strength={0.3} max={10}>
      <Link
        href={href}
        className="group inline-flex items-center gap-2.5 rounded-full py-1 pr-1 pl-2 text-sm font-medium whitespace-nowrap text-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
      >
        <span data-magnetic-inner className="inline-block">
          {children}
        </span>
        <span
          aria-hidden
          className="relative grid size-8 place-items-center overflow-hidden rounded-full border border-foreground/20 text-foreground transition-colors duration-300 group-hover:border-brand-blue group-hover:bg-brand-blue group-hover:text-white group-focus-visible:border-brand-blue group-focus-visible:bg-brand-blue group-focus-visible:text-white"
        >
          <ArrowRight
            className="size-4 transition-transform duration-300 ease-[cubic-bezier(.35,0,0,1)] group-hover:translate-x-[180%] group-focus-visible:translate-x-[180%] motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-focus-visible:translate-x-0"
            strokeWidth={2.25}
          />
          <ArrowRight
            className="absolute size-4 -translate-x-[180%] transition-transform duration-300 ease-[cubic-bezier(.35,0,0,1)] group-hover:translate-x-0 group-focus-visible:translate-x-0 motion-reduce:hidden"
            strokeWidth={2.25}
          />
        </span>
      </Link>
    </Magnetic>
  );
}
