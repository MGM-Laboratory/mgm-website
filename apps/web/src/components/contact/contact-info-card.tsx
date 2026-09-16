"use client";

import { useRef, useState } from "react";
import { Copy, Mail, MapPin, Navigation, Plus, Send } from "lucide-react";
import type { ContactSettings } from "@repo/shared";
import { toast } from "sonner";

import { HqMap } from "@/components/contact/hq-map";
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
      description: "Your browser blocked clipboard access — copy it by hand.",
    });
  }
}

// Clicking the value reveals a small action menu instead of always-visible
// buttons — same interaction as the nav menu's email trigger
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

export function ContactInfoCard({ settings }: Readonly<{ settings: ContactSettings }>) {
  const addressLines = settings.address.split("\n");
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${settings.lat}%2C${settings.lng}`;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-6 sm:p-8">
      <p className="text-xs font-semibold tracking-wide text-foreground/45 uppercase">
        Reach us directly
      </p>

      <div className="mt-4 flex flex-col divide-y divide-[var(--line)]">
        <div className="pb-4">
          <InfoRow icon={Mail} label="Email">
            <RevealPopover
              trigger={settings.email}
              triggerClassName="font-display text-base font-semibold text-foreground"
              actions={[
                { icon: Send, label: "Send email", href: `mailto:${settings.email}` },
                {
                  icon: Copy,
                  label: "Copy email",
                  onClick: () => copyToClipboard("Email", settings.email),
                },
              ]}
            />
          </InfoRow>
        </div>

        <div className="py-4">
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
            <div className="mt-3">
              <HqMap lat={settings.lat} lng={settings.lng} />
            </div>
          </InfoRow>
        </div>
      </div>
    </div>
  );
}
