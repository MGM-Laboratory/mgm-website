"use client";

import { useLayoutEffect, useRef } from "react";
import type { ContactSettings } from "@repo/shared";

import { CtaFooter } from "@/components/sections/cta-footer";
import { ContactForm } from "@/components/contact/contact-form";
import { ContactInfoCard } from "@/components/contact/contact-info-card";
import { FlairShape } from "@/components/process/pattern-tile";
import { fadeUpOnScroll } from "@/lib/scroll-reveal";

export function ContactContent({ settings }: Readonly<{ settings: ContactSettings }>) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-1 flex-col">
      <main className="flex flex-1 flex-col">
        <section className="relative overflow-hidden bg-[var(--surface-muted)] px-6 py-20 sm:px-10 sm:py-28 lg:px-16">
          <FlairShape
            kind="arcs"
            tone="green"
            className="pointer-events-none absolute -top-10 -right-10 size-64 opacity-25 sm:size-80 dark:opacity-35"
          />
          <div className="relative mx-auto max-w-3xl">
            <p className="text-sm font-semibold tracking-wide text-brand-green uppercase">
              Contact
            </p>
            <h1 className="mt-3 font-display text-[clamp(2rem,4vw,3rem)] font-semibold tracking-tight text-foreground">
              Let&apos;s talk.
            </h1>
            <p className="mt-5 max-w-xl text-foreground/65">
              Have a project, a research question, or just want to say hello? Tell us what&apos;s on
              your mind — we&apos;ll get back to you soon.
            </p>
          </div>
        </section>

        <section ref={rootRef} className="bg-background px-6 py-16 sm:px-10 sm:py-20 lg:px-16">
          <noscript>
            <style>{".reveal-card{opacity:1 !important}"}</style>
          </noscript>
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-5 lg:items-start">
            <div className="reveal-card opacity-0 lg:col-span-3">
              <ContactForm />
            </div>
            <div className="reveal-card opacity-0 lg:col-span-2">
              <ContactInfoCard settings={settings} />
            </div>
          </div>
        </section>
      </main>
      <CtaFooter />
    </div>
  );
}
