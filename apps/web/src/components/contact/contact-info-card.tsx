"use client";

import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Copy, Mail, MapPin, Navigation, Plus, Send } from "lucide-react";
import type { ContactSettings } from "@repo/shared";
import { toast } from "sonner";

import {
  DiscordGlyph,
  InstagramGlyph,
  LinkedinGlyph,
  type GlyphProps,
} from "@/components/social-icons";
import { NAV_SOCIALS } from "@/data/nav";
import { useDismissableOpen } from "@/hooks/use-dismissable-open";
import { cn } from "@/lib/utils";

type IconType = typeof Mail;

function InfoRow({
  icon: Icon,
  label,
  children,
}: Readonly<{
  icon: IconType;
  label: string;
  children: React.ReactNode;
}>) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-brand-green" strokeWidth={2.25} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-wide text-foreground/45 uppercase">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

type PopoverAction =
  | { icon: IconType; label: string; onClick: () => void }
  | { icon: IconType; label: string; href: string; external?: boolean };

async function copyToClipboard(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`${label} could not be copied`, {
      description: "Your browser blocked clipboard access - copy it by hand.",
    });
  }
}

// Clicking the value reveals a small action menu instead of always-visible
// buttons - same interaction as the nav menu's email trigger
// (components/nav/email-reveal.tsx), reused here for both email and address.
function RevealPopover({
  trigger,
  triggerClassName,
  align = "center",
  actions,
}: Readonly<{
  trigger: React.ReactNode;
  triggerClassName?: string;
  align?: "center" | "start";
  actions: PopoverAction[];
}>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismissableOpen(ref, open, setOpen);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "group flex cursor-pointer gap-1.5 text-left transition-colors hover:text-brand-blue",
          align === "start" ? "items-start" : "items-center",
          triggerClassName,
        )}
      >
        {trigger}
        <Plus
          className={cn(
            "size-3.5 shrink-0 text-foreground/40 transition-transform duration-200 group-hover:text-brand-blue",
            align === "start" && "mt-1",
            open && "rotate-45",
          )}
        />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-max min-w-[11rem] rounded-xl border border-[var(--line)] bg-white p-1.5 shadow-2xl dark:border-white/10 dark:bg-[#12151c]"
        >
          {actions.map((action) => {
            const Icon = action.icon;
            const itemClass =
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground/80 transition-colors hover:bg-[var(--surface-muted)] hover:text-brand-blue dark:hover:bg-white/[0.06]";
            return "href" in action ? (
              <a
                key={action.label}
                href={action.href}
                role="menuitem"
                className={itemClass}
                target={action.external ? "_blank" : undefined}
                rel={action.external ? "noreferrer" : undefined}
                onClick={() => setOpen(false)}
              >
                <Icon className="size-4" strokeWidth={2.25} />
                {action.label}
              </a>
            ) : (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => {
                  action.onClick();
                  setOpen(false);
                }}
              >
                <Icon className="size-4" strokeWidth={2.25} />
                {action.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const SOCIAL_GLYPHS: Record<string, React.ComponentType<GlyphProps>> = {
  Discord: DiscordGlyph,
  Instagram: InstagramGlyph,
  LinkedIn: LinkedinGlyph,
};

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

// One persistent, paused timeline per icon - hover plays it forward, unhover
// reverses it. `overwrite: "auto"` keeps rapid re-hovering from desyncing the
// timeline mid-play (see the events-cms popover work for why that matters).
function useSocialWiggle() {
  return (icon: SVGSVGElement | null) => {
    if (!icon || reducedMotion()) return;
    const tl = gsap.timeline({ paused: true, defaults: { overwrite: "auto" } });
    tl.to(icon, { rotate: -12, scale: 1.08, duration: 0.12, ease: "power1.out" }).to(icon, {
      rotate: 0,
      scale: 1,
      duration: 0.22,
      ease: "back.out(2.5)",
    });
    const play = () => tl.play(0);
    icon.addEventListener("mouseenter", play);
    return () => icon.removeEventListener("mouseenter", play);
  };
}

function FoundUsOn() {
  const wireIcon = useSocialWiggle();

  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-foreground/45 uppercase">
        Found us on
      </p>
      <div className="mt-3 flex items-center gap-2.5">
        {NAV_SOCIALS.map((social) => {
          const Glyph = SOCIAL_GLYPHS[social.label];
          if (!Glyph) return null;
          return (
            <a
              key={social.label}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${social.label} (opens in a new tab)`}
              className="flex size-11 items-center justify-center rounded-full border border-[var(--line)] text-foreground/70 transition-colors duration-200 hover:border-brand-blue hover:bg-brand-blue-50 hover:text-brand-blue focus-visible:border-brand-blue focus-visible:ring-4 focus-visible:ring-brand-blue/15 focus-visible:outline-none"
            >
              <Glyph
                className="size-[1.15rem]"
                ref={(node) => {
                  if (!node) return;
                  return wireIcon(node);
                }}
              />
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function ContactInfoCard({ settings }: Readonly<{ settings: ContactSettings }>) {
  const addressLines = settings.address.split("\n");
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${settings.lat}%2C${settings.lng}`;
  const primaryEmail = settings.emails[0];

  const cardRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const rows = card.querySelectorAll<HTMLElement>(".info-reveal");
    if (!rows.length) return;
    if (reducedMotion()) {
      gsap.set(rows, { opacity: 1 });
      return;
    }
    // clearProps drops the inline transform once each row settles at rest -
    // otherwise the leftover `transform: translateY(0)` keeps the row as its
    // own stacking context forever, trapping its RevealPopover's z-30 below
    // whatever row comes next in DOM order (see docs/animation-system.md
    // gotcha #7). The popover's own position is unaffected either way.
    const tween = gsap.fromTo(
      rows,
      { opacity: 0, y: 12 },
      {
        opacity: 1,
        y: 0,
        duration: 0.5,
        ease: "power3.out",
        stagger: 0.08,
        immediateRender: true,
        clearProps: "transform",
      },
    );
    return () => {
      tween.kill();
    };
  }, []);

  return (
    // skipcq: JS-0415 -- ordinary card layout depth, not a code smell
    <div
      ref={cardRef}
      className="rounded-3xl border border-[var(--line)] bg-[var(--surface-muted)] p-6 sm:p-7"
    >
      <noscript>
        <style>{".info-reveal{opacity:1 !important}"}</style>
      </noscript>
      <p className="info-reveal text-xs font-semibold tracking-wide text-foreground/45 uppercase opacity-0">
        Reach us directly
      </p>

      <div className="mt-4 flex flex-col gap-5">
        <div className="info-reveal opacity-0">
          <InfoRow icon={Mail} label="Email">
            <RevealPopover
              trigger={primaryEmail}
              triggerClassName="font-display text-base font-semibold text-foreground"
              actions={[
                { icon: Send, label: "Send email", href: `mailto:${primaryEmail}` },
                {
                  icon: Copy,
                  label: "Copy email",
                  onClick: () => copyToClipboard("Email", primaryEmail),
                },
              ]}
            />
          </InfoRow>
        </div>

        <div className="info-reveal opacity-0">
          <InfoRow icon={MapPin} label="Based in">
            <RevealPopover
              align="start"
              trigger={
                <span className="text-sm text-foreground/70 transition-colors group-hover:text-brand-blue">
                  {addressLines.map((line, i) => (
                    <span key={line}>
                      {i > 0 ? <br /> : null}
                      {line}
                    </span>
                  ))}
                </span>
              }
              actions={[
                { icon: Navigation, label: "Open in Maps", href: directionsUrl, external: true },
                {
                  icon: Copy,
                  label: "Copy address",
                  onClick: () => copyToClipboard("Address", settings.address),
                },
              ]}
            />
          </InfoRow>
        </div>

        <div className="info-reveal opacity-0 border-t border-[var(--line)] pt-5">
          <FoundUsOn />
        </div>
      </div>
    </div>
  );
}
