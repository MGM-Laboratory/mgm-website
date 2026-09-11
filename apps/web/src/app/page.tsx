import Image from "next/image";
import Link from "next/link";

import { Hero } from "@/components/hero/hero";
import { ProcessSection } from "@/components/process/process-section";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Services", href: "/services" },
  { label: "Projects", href: "/projects" },
  { label: "Contact Us", href: "/contact" },
  { label: "About Us", href: "/about" },
];

export default function Home() {
  return (
    <div className="relative flex min-h-dvh flex-1 flex-col">
      <header className="flex items-center justify-between gap-6 border-b border-[var(--line)] bg-background px-6 py-3 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo.svg" alt="MGM Laboratory" width={34} height={34} priority />
          <span className="flex flex-col leading-[1.15] font-display tracking-tight">
            <span className="font-bold">MGM</span>
            <span className="font-medium text-foreground/80">Laboratory</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm md:flex">
          {NAV_LINKS.map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                i === 0
                  ? "font-semibold text-foreground"
                  : "text-foreground/55 transition-colors hover:text-foreground"
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-foreground/40">ID</span>
            <span className="font-semibold text-brand-blue">EN</span>
          </div>
          <ThemeToggle className="size-8" />
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <Hero />
        <ProcessSection />
      </main>
    </div>
  );
}
