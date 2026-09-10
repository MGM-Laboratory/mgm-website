import Image from "next/image";

import { ApiStatus } from "@/components/api-status";
import { Hero } from "@/components/hero";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <span className="flex items-center gap-2 font-display font-semibold tracking-tight">
          <Image src="/logo.svg" alt="MGM Laboratory" width={28} height={28} priority />
          MGM Laboratory
        </span>
        <div className="flex items-center gap-3">
          <ApiStatus />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <Hero />
        <p className="mt-6 max-w-md text-sm text-black/60 dark:text-white/60">
          A calm, premium product surface — built for MGM Laboratory.
        </p>
      </main>

      <Image
        src="/patterns/circle-blue-on-white.svg"
        alt=""
        aria-hidden
        width={120}
        height={120}
        className="pointer-events-none absolute -bottom-6 -right-6 opacity-70 dark:hidden"
      />
    </div>
  );
}
