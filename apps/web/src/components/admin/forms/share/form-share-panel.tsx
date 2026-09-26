"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowSquareOut,
  CalendarBlank,
  Envelope,
  FacebookLogo,
  Info,
  LinkedinLogo,
  Lock,
  PaperPlaneTilt,
  RocketLaunch,
  ShareNetwork,
  TelegramLogo,
  WhatsappLogo,
  XLogo,
} from "@phosphor-icons/react";
import type { FormRecord } from "@repo/shared";

import { formsAdminApi } from "@/lib/forms/admin-api";
import type { ShortlinkLink } from "@/lib/links-cms";

import { QrCard } from "./qr-card";
import { CopyButton, Section, SnippetBox, chipClass, inputClass, labelClass } from "./share-ui";
import { ShortLinks } from "./short-links";

export type FormSharePanelProps = {
  form: FormRecord;
  /** The public origin links are built on (window.location.origin in the studio). */
  origin: string;
  /** The admin may list and create short links (the `links` permission). */
  canReadLinks: boolean;
  canWriteLinks: boolean;
  /** The admin may change the form (publish from the share panel). */
  canWrite: boolean;
  onFormChange: (form: FormRecord) => void;
};

const STATUS_TONE: Record<FormRecord["status"], string> = {
  draft: "bg-[#eef0f4] text-[#5c6470] dark:bg-white/10 dark:text-white/55",
  published: "bg-brand-green-50 text-brand-green",
  closed: "bg-brand-red-50 text-brand-red",
};

function escapeAttribute(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function Notices({ form, now }: { form: FormRecord; now: number }) {
  const settings = form.document.settings;
  const notes: { tone: "warn" | "info"; icon: React.ReactNode; text: string }[] = [];
  if (form.status === "draft")
    notes.push({
      tone: "warn",
      icon: <Info size={15} />,
      text: "This form is a draft: the link answers 404 until it is published.",
    });
  if (form.status === "closed")
    notes.push({
      tone: "warn",
      icon: <Lock size={15} />,
      text: "This form is closed: visitors see its closed screen.",
    });
  const opens = settings.opensAt ? Date.parse(settings.opensAt) : NaN;
  const closes = settings.closesAt ? Date.parse(settings.closesAt) : NaN;
  if (Number.isFinite(opens) && opens > now)
    notes.push({
      tone: "info",
      icon: <CalendarBlank size={15} />,
      text: `Scheduled: it opens ${new Date(opens).toLocaleString()}.`,
    });
  if (Number.isFinite(closes))
    notes.push({
      tone: closes < now ? "warn" : "info",
      icon: <CalendarBlank size={15} />,
      text:
        closes < now
          ? `It closed on ${new Date(closes).toLocaleString()}.`
          : `It closes ${new Date(closes).toLocaleString()}.`,
    });
  if (settings.responseLimit) {
    const left = settings.responseLimit - form.stats.responses;
    notes.push({
      tone: left <= 0 ? "warn" : "info",
      icon: <Info size={15} />,
      text:
        left <= 0
          ? `The limit of ${settings.responseLimit} responses is reached, so it no longer accepts answers.`
          : `Limited to ${settings.responseLimit} responses (${left} left).`,
    });
  }
  if (form.hasPassphrase)
    notes.push({
      tone: "info",
      icon: <Lock size={15} />,
      text: "Visitors need the passphrase to open it.",
    });
  if (!notes.length) return null;
  return (
    <ul className="mt-3 space-y-1.5">
      {notes.map((note) => (
        <li
          className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs leading-5 ${note.tone === "warn" ? "bg-brand-yellow-50 text-[#6d5210] dark:bg-brand-yellow/10 dark:text-brand-yellow" : "bg-brand-blue-50 text-[#2a4a82] dark:bg-brand-blue/10 dark:text-[#9dbaf0]"}`}
          key={note.text}
        >
          <span className="mt-0.5 shrink-0">{note.icon}</span>
          {note.text}
        </li>
      ))}
    </ul>
  );
}

/** The Share tab: the public link, QR codes, short links, embeds and share buttons. */
export function FormSharePanel({
  form,
  origin,
  canReadLinks,
  canWriteLinks,
  canWrite,
  onFormChange,
}: FormSharePanelProps) {
  const formUrl = `${origin.replace(/\/$/, "")}/forms/${form.slug}`;
  const [publishing, setPublishing] = useState(false);
  const [shortLinks, setShortLinks] = useState<ShortlinkLink[]>([]);
  const [height, setHeight] = useState(640);
  const [buttonLabel, setButtonLabel] = useState(
    form.document.welcome.buttonLabel || "Open the form",
  );
  const qrRef = useRef<HTMLDivElement>(null);
  const [qrTarget, setQrTarget] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const title = form.document.title;

  const publish = async () => {
    setPublishing(true);
    try {
      const { form: updated } = await formsAdminApi.update(form.id, { status: "published" });
      onFormChange(updated);
      toast.success("Published", { description: formUrl });
    } catch (error) {
      toast.error("Could not publish", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPublishing(false);
    }
  };

  const onLinksChange = useCallback((links: ShortlinkLink[]) => {
    setShortLinks(links);
  }, []);
  const targets = useMemo(
    () => [
      { label: `Form link (${formUrl.replace(/^https?:\/\//, "")})`, url: formUrl },
      ...shortLinks.map((link) => ({
        label: `Short link ${link.shortUrl.replace(/^https?:\/\//, "")}`,
        url: link.shortUrl,
      })),
    ],
    [formUrl, shortLinks],
  );

  const iframeSnippet = `<div style="position:relative;width:100%;max-width:760px;margin:0 auto;height:${height}px;border-radius:16px;overflow:hidden">
  <iframe src="${escapeAttribute(formUrl)}" title="${escapeAttribute(title)}" loading="lazy" allow="clipboard-write" style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
</div>`;
  const buttonSnippet = `<a href="${escapeAttribute(formUrl)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:999px;background:#3a6dc5;color:#ffffff;font:600 15px/1.2 system-ui,sans-serif;text-decoration:none">${escapeAttribute(buttonLabel)}</a>`;
  const linkSnippet = `<a href="${escapeAttribute(formUrl)}">${escapeAttribute(title)}</a>`;

  const shareText = `${title}`;
  const encoded = encodeURIComponent(formUrl);
  const text = encodeURIComponent(shareText);
  const shareTargets = [
    {
      label: "WhatsApp",
      icon: WhatsappLogo,
      href: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${formUrl}`)}`,
    },
    {
      label: "Telegram",
      icon: TelegramLogo,
      href: `https://t.me/share/url?url=${encoded}&text=${text}`,
    },
    { label: "X", icon: XLogo, href: `https://x.com/intent/post?url=${encoded}&text=${text}` },
    {
      label: "LinkedIn",
      icon: LinkedinLogo,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`,
    },
    {
      label: "Facebook",
      icon: FacebookLogo,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encoded}`,
    },
    {
      label: "Email",
      icon: Envelope,
      href: `mailto:?subject=${text}&body=${encodeURIComponent(`${shareText}\n\n${formUrl}`)}`,
    },
  ];
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
      data-testid="share-panel"
    >
      <div className="xl:col-span-2">
        <Section
          actions={
            <span className={`${chipClass} ${STATUS_TONE[form.status]}`}>{form.status}</span>
          }
          description="Anyone with the link can open the form while it is published."
          testId="share-link"
          title="Public link"
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Public form link"
              className={`${inputClass} min-w-0 flex-1 basis-64 font-mono`}
              onFocus={(event) => {
                event.currentTarget.select();
              }}
              readOnly
              value={formUrl}
            />
            <CopyButton text={formUrl} />
            <a
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#d9dfeb] bg-white px-3 text-sm font-semibold text-[#3b4150] hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:bg-white/[0.03] dark:text-white/75"
              href={formUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ArrowSquareOut size={15} /> Open
            </a>
            {form.status !== "published" && canWrite ? (
              <button
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-blue px-4 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
                disabled={publishing}
                onClick={() => void publish()}
                type="button"
              >
                <RocketLaunch size={15} />{" "}
                {publishing ? "Publishing…" : form.status === "closed" ? "Reopen" : "Publish now"}
              </button>
            ) : null}
          </div>
          <Notices form={form} now={now} />
        </Section>
      </div>

      <div ref={qrRef}>
        <Section
          description="Print it on posters and slides. Both colour choices keep dark modules on a light background."
          testId="share-qr"
          title="QR code"
        >
          <QrCard
            form={form}
            key={qrTarget ?? "form"}
            targets={
              qrTarget
                ? [...targets].sort(
                    (a, b) => Number(b.url === qrTarget) - Number(a.url === qrTarget),
                  )
                : targets
            }
          />
        </Section>
      </div>

      <Section
        description="Share on the channels your audience uses."
        testId="share-buttons"
        title="Share"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {shareTargets.map((target) => (
            <a
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#d9dfeb] px-3 text-sm font-semibold text-[#3b4150] transition hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/75"
              href={target.href}
              key={target.label}
              rel="noreferrer noopener"
              target={target.label === "Email" ? undefined : "_blank"}
            >
              <target.icon aria-hidden size={18} weight="regular" /> {target.label}
            </a>
          ))}
          {canNativeShare ? (
            <button
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#d9dfeb] px-3 text-sm font-semibold text-[#3b4150] hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/75"
              onClick={() => {
                navigator.share({ title, url: formUrl }).catch(() => undefined);
              }}
              type="button"
            >
              <ShareNetwork aria-hidden size={18} /> More…
            </button>
          ) : null}
        </div>
      </Section>

      <div className="xl:col-span-2">
        <Section
          description="Tracked, shorter links that point at this form, made without leaving the page."
          testId="share-short-links"
          title="Short links"
        >
          <ShortLinks
            canRead={canReadLinks}
            canWrite={canWriteLinks}
            form={form}
            formUrl={formUrl}
            onLinksChange={onLinksChange}
            onShowQr={(link) => {
              setQrTarget(link.shortUrl);
              qrRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
        </Section>
      </div>

      <div className="xl:col-span-2">
        <Section description="Put the form on another page." testId="share-embed" title="Embed">
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="min-w-0 space-y-2">
              <div className="flex items-end gap-2">
                <p className={`${labelClass} flex-1`}>Inline frame</p>
                <label className="flex items-center gap-1.5 text-xs text-[#5c6679] dark:text-white/55">
                  Height
                  <input
                    aria-label="Frame height in pixels"
                    className="h-8 w-20 rounded-lg border border-[#d9dfeb] bg-white px-2 text-xs dark:border-white/10 dark:bg-white/5"
                    max={2000}
                    min={320}
                    onChange={(event) => {
                      setHeight(Math.max(320, Math.min(2000, Number(event.target.value) || 640)));
                    }}
                    step={20}
                    type="number"
                    value={height}
                  />
                  px
                </label>
              </div>
              <SnippetBox code={iframeSnippet} what="Embed code" />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex items-end gap-2">
                <p className={`${labelClass} flex-1`}>Button that opens it</p>
                <input
                  aria-label="Button label"
                  className="h-8 w-36 rounded-lg border border-[#d9dfeb] bg-white px-2 text-xs dark:border-white/10 dark:bg-white/5"
                  maxLength={40}
                  onChange={(event) => {
                    setButtonLabel(event.target.value);
                  }}
                  value={buttonLabel}
                />
              </div>
              <SnippetBox code={buttonSnippet} what="Button code" />
            </div>
            <div className="min-w-0 space-y-2">
              <p className={labelClass}>Full-page link</p>
              <SnippetBox code={linkSnippet} what="Link code" />
              <p className="flex items-center gap-1.5 text-[11px] text-[#8a93a6]">
                <PaperPlaneTilt size={12} /> Opens the immersive full-page form, the best experience
                on phones.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
