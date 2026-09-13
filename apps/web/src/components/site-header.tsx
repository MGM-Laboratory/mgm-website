"use client";

import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { LogoMark } from "@/components/nav/logo-mark";
import { NavMenu } from "@/components/nav/nav-menu";

// Rendered outside the ScrollSmoother wrapper (see layout.tsx) and kept
// `fixed` — a `sticky` header inside smooth-scrolled content doesn't stick,
// since ScrollSmoother moves content via `transform`, which carries sticky
// descendants along with it instead of letting them stick to the viewport.
// The nav panel/overlay NavMenu renders are `fixed` themselves and sit at a
// lower z-index than this header, so the header (logo + toggle) stays
// crisp and clickable on top while the panel slides in below it.
export function SiteHeader() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between gap-4 border-b border-[var(--line)] bg-background px-6 sm:px-10">
      <LogoMark />

      <div className="flex items-center gap-2 sm:gap-4">
        <div className="hidden items-center gap-1.5 text-sm sm:flex">
          <span className="text-foreground/40">ID</span>
          <span className="font-semibold text-brand-blue">EN</span>
        </div>
        <ThemeToggle className="size-8" />
        <NavMenu />
      </div>
    </header>
  );
}

export const SITE_HEADER_HEIGHT = 64;
