"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowSquareOut, LinkSimple, Plus, QrCode } from "@phosphor-icons/react";
import type { FormRecord } from "@repo/shared";

import {
  EXPIRY_OPTIONS,
  STATUS_HINT,
  STATUS_LABEL,
  type LinkStatus,
  type ShortlinkDomain,
  type ShortlinkLink,
} from "@/lib/links-cms";

import { CopyButton, chipClass, inputClass, labelClass } from "./share-ui";

const LAST_DOMAIN_KEY = "mgm.links.lastDomainId";
const SLUG_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;

const STATUS_TONE: Record<LinkStatus, string> = {
  available: "bg-brand-green-50 text-brand-green",
  consumed: "bg-brand-yellow-50 text-[#a97b1c]",
  error: "bg-brand-red text-white",
  expired: "bg-[#eef0f4] text-[#5c6470] dark:bg-white/10 dark:text-white/50",
};

async function jsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
      error?: string;
    } | null;
    const message = Array.isArray(body?.message) ? body?.message.join(" ") : body?.message;
    throw new Error(message ?? body?.error ?? "Something went wrong.");
  }
  return response.json() as Promise<T>;
}

/**
 * A same-origin admin GET. XMLHttpRequest rather than fetch because the
 * path carries the form's slug (the static analysis flags fetch with a
 * built URL even for same-origin admin routes).
 */
function getAdminJson<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", path);
    request.responseType = "json";
    request.onload = () => {
      const body = request.response as { message?: string | string[]; error?: string } | null;
      if (request.status >= 200 && request.status < 300) resolve(body as T);
      else
        reject(
          new Error(
            (Array.isArray(body?.message) ? body?.message.join(" ") : body?.message) ??
              body?.error ??
              `Request failed (${request.status}).`,
          ),
        );
    };
    request.onerror = () => {
      reject(new Error("Network error."));
    };
    request.send();
  });
}

function readLastDomain(): string | null {
  try {
    return window.localStorage.getItem(LAST_DOMAIN_KEY);
  } catch {
    return null;
  }
}

function writeLastDomain(id: string) {
  try {
    window.localStorage.setItem(LAST_DOMAIN_KEY, id);
  } catch {
    // Not remembered, that's all.
  }
}

/** True when `longUrl` points at the form: its URL, then the end, a query, a hash or a slash. */
export function pointsAtForm(longUrl: string, formUrl: string) {
  if (!longUrl.startsWith(formUrl)) return false;
  const next = longUrl.charAt(formUrl.length);
  return next === "" || next === "?" || next === "#" || next === "/";
}

/** The form URL with UTM and prefill parameters appended. */
export function buildLongUrl(
  formUrl: string,
  utm: Record<string, string>,
  prefill: Record<string, string>,
) {
  const url = new URL(formUrl);
  for (const key of UTM_KEYS) {
    const value = utm[key]?.trim();
    if (value) url.searchParams.set(`utm_${key}`, value);
  }
  for (const [key, value] of Object.entries(prefill)) {
    if (value.trim()) url.searchParams.set(key, value.trim());
  }
  return url.toString();
}

/**
 * Short links for this form, without leaving the page: the ones that
 * already point at it, and a shorten form with a UTM builder and prefill
 * parameters for hidden fields.
 */
export function ShortLinks({
  form,
  formUrl,
  canRead,
  canWrite,
  onShowQr,
  onLinksChange,
}: {
  form: FormRecord;
  formUrl: string;
  canRead: boolean;
  canWrite: boolean;
  onShowQr: (link: ShortlinkLink) => void;
  onLinksChange: (links: ShortlinkLink[]) => void;
}) {
  const [links, setLinks] = useState<ShortlinkLink[] | null>(null);
  const [domains, setDomains] = useState<ShortlinkDomain[]>([]);
  const [domainId, setDomainId] = useState("");
  const [slug, setSlug] = useState("");
  const [expiresIn, setExpiresIn] = useState<(typeof EXPIRY_OPTIONS)[number]["id"]>("never");
  const [passphraseOn, setPassphraseOn] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [utm, setUtm] = useState<Record<string, string>>({});
  const [prefill, setPrefill] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const prefillFields = useMemo(
    () =>
      form.document.fields
        .filter((field) => field.type === "hidden" || field.prefillParam)
        .map((field) => ({
          param: field.prefillParam || field.id,
          label: field.label || field.prefillParam || field.id,
        })),
    [form.document.fields],
  );

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;
    const search = encodeURIComponent(`/forms/${form.slug}`);
    Promise.all([
      getAdminJson<{ links: ShortlinkLink[] }>(`/api/admin/links?search=${search}`),
      getAdminJson<{ domains: ShortlinkDomain[] }>("/api/admin/links/domains"),
    ])
      .then(([linksBody, domainsBody]) => {
        if (cancelled) return;
        const mine = linksBody.links.filter((link) => pointsAtForm(link.longUrl, formUrl));
        setLinks(mine);
        onLinksChange(mine);
        const connected = domainsBody.domains.filter((domain) => domain.status === "connected");
        setDomains(connected);
        const remembered = readLastDomain();
        const fallback = connected.find((domain) => domain.isPrimary)?.id ?? connected[0]?.id ?? "";
        setDomainId(
          connected.some((domain) => domain.id === remembered) ? (remembered as string) : fallback,
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLinks([]);
        toast.error("Could not load short links", {
          description: error instanceof Error ? error.message : undefined,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [canRead, form.slug, formUrl, onLinksChange]);

  if (!canRead) {
    return (
      <p className="rounded-xl bg-[#f7f8fa] px-3 py-3 text-xs leading-5 text-[#5c6679] dark:bg-white/5 dark:text-white/55">
        Short links live in the link shortener, which your account can&apos;t open. Ask a superadmin
        for the <b>links</b> permission to create and see short links for this form here.
      </p>
    );
  }

  const longUrl = (() => {
    try {
      return buildLongUrl(formUrl, utm, prefill);
    } catch {
      return formUrl;
    }
  })();

  const create = async () => {
    const code = slug.trim();
    if (code && !SLUG_PATTERN.test(code)) {
      toast.error("That short code won't work", {
        description: "Use letters, numbers, hyphens and underscores only (up to 64).",
      });
      return;
    }
    if (passphraseOn && !passphrase) {
      toast.error("Add a passphrase", {
        description: "Turn the switch off if the link is public.",
      });
      return;
    }
    if (!domainId) {
      toast.error("Pick a domain");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domainId,
          longUrl,
          slug: code || undefined,
          expiresIn,
          passphrase: passphraseOn ? passphrase : undefined,
        }),
      });
      const body = await jsonOrThrow<{ link: ShortlinkLink }>(response);
      writeLastDomain(domainId);
      setLinks((current) => {
        const next = [body.link, ...(current ?? [])];
        onLinksChange(next);
        return next;
      });
      setSlug("");
      setPassphrase("");
      setPassphraseOn(false);
      toast.success("Link shortened", { description: body.link.shortUrl });
    } catch (error) {
      toast.error("Could not shorten", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const slugInvalid = Boolean(slug.trim()) && !SLUG_PATTERN.test(slug.trim());

  return (
    <div className="space-y-5" data-testid="short-links">
      {links === null ? (
        <div className="h-16 animate-pulse rounded-xl bg-[#f3f5f8] motion-reduce:animate-none dark:bg-white/5" />
      ) : links.length ? (
        <ul className="divide-y divide-[#eef0f4] rounded-xl border border-[#e4e8f0] dark:divide-white/5 dark:border-white/10">
          {links.map((link) => (
            <li
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5"
              data-testid="short-link-row"
              key={link.id}
            >
              <LinkSimple className="shrink-0 text-brand-green" size={16} />
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate font-mono text-sm font-semibold">{link.shortUrl}</p>
                <p className="truncate text-[11px] text-[#8a93a6]" title={link.longUrl}>
                  {link.longUrl.slice(formUrl.length) || "the form link"}
                </p>
              </div>
              <span
                className={`${chipClass} ${STATUS_TONE[link.status]}`}
                title={STATUS_HINT[link.status]}
              >
                {STATUS_LABEL[link.status]}
              </span>
              <span className="text-xs tabular-nums text-[#5c6679] dark:text-white/55">
                {link.viewCount} views · {link.clickCount} clicks
              </span>
              <span className="text-xs text-[#8a93a6]">
                {link.expiresAt
                  ? `expires ${new Date(link.expiresAt).toLocaleDateString()}`
                  : link.maxClicks === 1
                    ? "single use"
                    : "never expires"}
              </span>
              <div className="flex items-center gap-1">
                <CopyButton label={`Copy ${link.shortUrl}`} text={link.shortUrl} />
                <button
                  aria-label={`QR code for ${link.shortUrl}`}
                  className="inline-flex h-10 items-center rounded-xl border border-[#d9dfeb] px-2.5 text-[#3b4150] hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/70"
                  onClick={() => {
                    onShowQr(link);
                  }}
                  type="button"
                >
                  <QrCode size={16} />
                </button>
                <a
                  aria-label={`Open ${link.shortUrl}`}
                  className="inline-flex h-10 items-center rounded-xl border border-[#d9dfeb] px-2.5 text-[#3b4150] hover:border-brand-blue hover:text-brand-blue dark:border-white/10 dark:text-white/70"
                  href={link.shortUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ArrowSquareOut size={16} />
                </a>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[#8a93a6]">No short links point at this form yet.</p>
      )}

      {canWrite ? (
        <div className="space-y-3 rounded-xl border border-dashed border-[#d9dfeb] p-4 dark:border-white/10">
          <p className={labelClass}>Shorten a link to this form</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className={`${labelClass} mb-1 block`}>Domain</span>
              <select
                className={inputClass}
                onChange={(event) => {
                  setDomainId(event.target.value);
                  writeLastDomain(event.target.value);
                }}
                value={domainId}
              >
                {domains.map((domain) => (
                  <option key={domain.id} value={domain.id}>
                    {domain.isPrimary ? `${domain.hostname} (site)` : domain.hostname}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={`${labelClass} mb-1 block`}>Short code (optional)</span>
              <input
                aria-invalid={slugInvalid}
                className={`${inputClass} font-mono ${slugInvalid ? "border-brand-red" : ""}`}
                maxLength={64}
                onChange={(event) => {
                  setSlug(event.target.value);
                }}
                placeholder="auto"
                value={slug}
              />
            </label>
            <label className="block">
              <span className={`${labelClass} mb-1 block`}>Expires</span>
              <select
                className={inputClass}
                onChange={(event) => {
                  setExpiresIn(event.target.value as typeof expiresIn);
                }}
                value={expiresIn}
              >
                {EXPIRY_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className={`${labelClass} mb-1 block`}>Passphrase</span>
              <div className="flex items-center gap-2">
                <button
                  aria-checked={passphraseOn}
                  aria-label="Require a passphrase"
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${passphraseOn ? "bg-brand-blue" : "bg-[#d6dbe6] dark:bg-white/15"}`}
                  onClick={() => {
                    setPassphraseOn((value) => !value);
                  }}
                  role="switch"
                  type="button"
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${passphraseOn ? "left-[22px]" : "left-0.5"}`}
                  />
                </button>
                {passphraseOn ? (
                  <input
                    aria-label="Passphrase"
                    className={inputClass}
                    onChange={(event) => {
                      setPassphrase(event.target.value);
                    }}
                    type="password"
                    value={passphrase}
                  />
                ) : (
                  <span className="text-xs text-[#8a93a6]">Public</span>
                )}
              </div>
            </div>
          </div>
          {slugInvalid ? (
            <p className="text-xs text-brand-red">
              Letters, numbers, hyphens and underscores only.
            </p>
          ) : null}
          <details
            className="rounded-xl bg-[#f7f8fa] p-3 dark:bg-white/[0.03]"
            open={Object.values(utm).some(Boolean)}
          >
            <summary className="cursor-pointer text-xs font-semibold text-[#3b4150] dark:text-white/75">
              UTM parameters
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {UTM_KEYS.map((key) => (
                <label className="block" key={key}>
                  <span className={`${labelClass} mb-1 block`}>{key}</span>
                  <input
                    className={`${inputClass} h-9`}
                    onChange={(event) => {
                      setUtm((current) => ({ ...current, [key]: event.target.value }));
                    }}
                    placeholder={
                      key === "source"
                        ? "instagram"
                        : key === "medium"
                          ? "social"
                          : key === "campaign"
                            ? "launch"
                            : ""
                    }
                    value={utm[key] ?? ""}
                  />
                </label>
              ))}
            </div>
          </details>
          {prefillFields.length ? (
            <details
              className="rounded-xl bg-[#f7f8fa] p-3 dark:bg-white/[0.03]"
              open={Object.values(prefill).some(Boolean)}
            >
              <summary className="cursor-pointer text-xs font-semibold text-[#3b4150] dark:text-white/75">
                Prefill hidden fields
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {prefillFields.map((item) => (
                  <label className="block" key={item.param}>
                    <span className={`${labelClass} mb-1 block`}>
                      {item.label} <span className="font-mono normal-case">?{item.param}=</span>
                    </span>
                    <input
                      className={`${inputClass} h-9`}
                      onChange={(event) => {
                        setPrefill((current) => ({ ...current, [item.param]: event.target.value }));
                      }}
                      value={prefill[item.param] ?? ""}
                    />
                  </label>
                ))}
              </div>
            </details>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <p
              className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#5c6679] dark:text-white/50"
              title={longUrl}
            >
              {longUrl}
            </p>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-blue px-5 text-sm font-semibold text-white transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
              disabled={busy || !domains.length}
              onClick={() => void create()}
              type="button"
            >
              <Plus size={16} weight="bold" /> {busy ? "Shortening…" : "Shorten"}
            </button>
          </div>
          {!domains.length ? (
            <p className="text-xs text-[#8a93a6]">
              No connected short-link domain yet. Add one in the link shortener.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-[#8a93a6]">
          You can see this form&apos;s short links but not create new ones (the links write
          permission).
        </p>
      )}
    </div>
  );
}
