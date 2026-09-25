"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowsClockwise,
  ChartBar,
  CloudArrowUp,
  Copy,
  Globe,
  LinkSimple,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";

import type {
  CloudflareSetupResult,
  LinkAnalytics,
  LinkStatus,
  ShortlinkDomain,
  ShortlinkLink,
} from "@/lib/links-cms";
import { EXPIRY_OPTIONS, STATUS_HINT, STATUS_LABEL } from "@/lib/links-cms";

const inputClass =
  "h-10 w-full rounded-xl border border-[#d9dfeb] bg-white px-3 text-sm text-[#171b25] outline-none transition placeholder:text-[#9ba4b5] focus:border-brand-blue focus:ring-4 focus:ring-brand-blue/10 dark:border-white/10 dark:bg-white/[0.045] dark:text-white dark:placeholder:text-white/25";
const labelClass =
  "text-[11px] font-bold uppercase tracking-[0.14em] text-[#7e899d] dark:text-white/35";
const chipClass =
  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.1em]";

const LAST_DOMAIN_KEY = "mgm-links-domain";
const SLUG_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const URL_PATTERN = /^https?:\/\//i;

type ExpiryId = "once" | "24h" | "3d" | "7d" | "30d" | "never" | "custom";

function lastUsedDomainId(domains: ShortlinkDomain[]): string {
  const primary = domains.find((domain) => domain.isPrimary);
  const mostRecent = [...domains]
    .filter((domain) => domain.lastUsedAt)
    .sort((a, b) => Date.parse(b.lastUsedAt ?? "") - Date.parse(a.lastUsedAt ?? ""))[0];
  return mostRecent?.id ?? primary?.id ?? "";
}

function expiryOf(link: ShortlinkLink): ExpiryId {
  if (link.maxClicks === 1) return "once";
  if (!link.expiresAt) return "never";
  const span = Date.parse(link.expiresAt) - Date.parse(link.createdAt);
  const options: [ExpiryId, number][] = [
    ["24h", 24 * 60 * 60 * 1000],
    ["3d", 3 * 24 * 60 * 60 * 1000],
    ["7d", 7 * 24 * 60 * 60 * 1000],
    ["30d", 30 * 24 * 60 * 60 * 1000],
  ];
  const match = options.find(([, ms]) => Math.abs(span - ms) < 60 * 1000);
  return match ? match[0] : "custom";
}

async function jsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;
    throw new Error(body?.message ?? body?.error ?? "Something went wrong.");
  }
  return response.json() as Promise<T>;
}

function StatusBadge({ status }: { status: LinkStatus }) {
  const tone =
    status === "available"
      ? "bg-brand-green-50 text-brand-green"
      : status === "consumed"
        ? "bg-brand-yellow-50 text-[#a97b1c]"
        : status === "error"
          ? "bg-brand-red text-white"
          : "bg-[#eef0f4] text-[#5c6470] dark:bg-white/10 dark:text-white/50";
  return (
    <span className={`${chipClass} ${tone}`} title={STATUS_HINT[status]}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={`${labelClass} mb-1.5 block`}>{label}</span>
      {children}
    </label>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#e4e8f0] bg-[#fbfbfa] px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="font-mono text-2xl font-semibold tabular-nums">{value}</div>
      <div className={`${labelClass} mt-0.5`}>{label}</div>
    </div>
  );
}

/** A stacked daily bar chart: the pale base is views, the blue core is clicks. */
function DailyChart({ days }: { days: { day: string; views: number; clicks: number }[] }) {
  const max = Math.max(1, ...days.map((day) => Math.max(day.views, day.clicks)));
  const ticks = [0, Math.round(max / 2), max];
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-[#778299] dark:text-white/45">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[#ecf1fa] ring-1 ring-[#c6d4ec]" /> Views
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-brand-blue" /> Clicks
        </span>
      </div>
      <div className="flex items-end gap-[3px]" style={{ height: 132 }}>
        {days.map((day) => {
          const viewsHeight = Math.max(2, Math.round((day.views / max) * 120));
          const clicksHeight = Math.round((day.clicks / max) * 120);
          const label = day.day.slice(5).replace("-", "/");
          const isToday = day.day === new Date().toISOString().slice(0, 10);
          return (
            <div
              className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
              key={day.day}
            >
              <div
                className="relative w-full rounded-[3px] bg-[#ecf1fa] ring-1 ring-[#d3dff2] transition group-hover:ring-brand-blue/50 dark:bg-[#233048] dark:ring-[#2e3f60]"
                style={{ height: viewsHeight }}
                title={`${day.day} · ${day.views} views, ${day.clicks} clicks`}
              >
                {day.clicks > 0 ? (
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-[3px] bg-brand-blue"
                    style={{ height: clicksHeight }}
                  />
                ) : null}
              </div>
              <div
                className={`mt-1.5 hidden text-center font-mono text-[8px] tabular-nums ${
                  isToday ? "text-brand-blue" : "text-[#9aa1ad] dark:text-white/30"
                } sm:block`}
              >
                {label}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9px] tabular-nums text-[#9aa1ad] dark:text-white/30">
        {ticks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </div>
  );
}

function BreakdownList({
  rows,
  empty,
}: {
  rows: { label: string; value: number }[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="space-y-1.5">
      {rows.length === 0 ? (
        <p className="text-xs text-[#9ba4b5] dark:text-white/35">{empty}</p>
      ) : (
        rows.map((row) => (
          <div className="flex items-center gap-2 text-xs" key={row.label}>
            <span className="w-28 min-w-0 truncate text-[#3b4150] dark:text-white/70">
              {row.label}
            </span>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#eef0f4] dark:bg-white/10">
              <span
                className="block h-full rounded-full bg-brand-blue/70"
                style={{ width: `${Math.round((row.value / max) * 100)}%` }}
              />
            </span>
            <span className="w-8 text-right font-mono tabular-nums text-[#778299] dark:text-white/45">
              {row.value}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function AnalyticsPanel({ analytics, onClose }: { analytics: LinkAnalytics; onClose: () => void }) {
  const locationOf = (visit: LinkAnalytics["recent"][number]) =>
    [visit.city, visit.country].filter(Boolean).join(", ") || "Unknown";
  return (
    <div className="rounded-2xl border border-[#e4e8f0] bg-[#fbfbfa] p-5 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold">
          Analytics · <span className="font-mono">{analytics.link.shortUrl}</span>
        </h3>
        <button
          aria-label="Close analytics"
          className="rounded-lg p-1.5 text-[#7e899d] transition hover:bg-white hover:text-[#3b4150] dark:hover:bg-white/10 dark:hover:text-white"
          onClick={onClose}
          type="button"
        >
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Views" value={analytics.totals.views} />
        <StatTile label="Clicks" value={analytics.totals.clicks} />
        <StatTile label="Unique visitors" value={analytics.totals.uniqueIps} />
        <StatTile label="Failed attempts" value={analytics.totals.failedAttempts} />
      </div>
      <div className="mt-5 rounded-xl border border-[#e4e8f0] bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div className={`${labelClass} mb-3`}>Last 14 days</div>
        <DailyChart days={analytics.days} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div>
          <div className={`${labelClass} mb-2.5`}>Countries</div>
          <BreakdownList
            empty="No visits yet."
            rows={analytics.countries.map((row) => ({ label: row.country, value: row.visits }))}
          />
        </div>
        <div>
          <div className={`${labelClass} mb-2.5`}>Referrers</div>
          <BreakdownList
            empty="No referrers yet."
            rows={analytics.referrers.map((row) => ({ label: row.host, value: row.visits }))}
          />
        </div>
        <div>
          <div className={`${labelClass} mb-2.5`}>Browsers & devices</div>
          <BreakdownList
            empty="No visits yet."
            rows={[
              ...analytics.browsers.map((row) => ({ label: row.browser, value: row.visits })),
              ...analytics.oss.map((row) => ({ label: row.os, value: row.visits })),
              ...analytics.devices.map((row) => ({ label: row.device, value: row.visits })),
            ]
              .sort((a, b) => b.value - a.value)
              .slice(0, 10)}
          />
        </div>
      </div>
      <div className="mt-5">
        <div className={`${labelClass} mb-2.5`}>Recent visits</div>
        <div className="overflow-x-auto rounded-xl border border-[#e4e8f0] dark:border-white/10">
          <table className="w-full min-w-[640px] border-collapse bg-white text-xs dark:bg-white/[0.03]">
            <thead>
              <tr className="border-b border-[#e4e8f0] text-left text-[#7e899d] dark:border-white/10 dark:text-white/40">
                <th className="px-3 py-2 font-semibold">When</th>
                <th className="px-3 py-2 font-semibold">Event</th>
                <th className="px-3 py-2 font-semibold">IP</th>
                <th className="px-3 py-2 font-semibold">Location</th>
                <th className="px-3 py-2 font-semibold">Client</th>
                <th className="px-3 py-2 font-semibold">Referer</th>
              </tr>
            </thead>
            <tbody>
              {analytics.recent.map((visit) => (
                <tr
                  className="border-b border-[#eef0f4] align-top last:border-0 dark:border-white/5"
                  key={visit.id}
                >
                  <td className="px-3 py-2 font-mono whitespace-nowrap tabular-nums">
                    {new Date(visit.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {visit.failedAttempt ? (
                      <span className="rounded-full bg-brand-red px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-white">
                        Rejected
                      </span>
                    ) : visit.isClick ? (
                      <span className="rounded-full bg-brand-green-50 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-brand-green">
                        Click
                      </span>
                    ) : (
                      <span className="rounded-full bg-brand-blue-50 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-brand-blue">
                        View
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap">{visit.ip ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{locationOf(visit)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {[visit.browser, visit.os, visit.device === "Desktop" ? null : visit.device]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2 text-[#778299] dark:text-white/45">
                    {visit.referer ?? "direct"}
                  </td>
                </tr>
              ))}
              {analytics.recent.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-[#9ba4b5]" colSpan={6}>
                    No visits yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function LinksStudio({
  initialDomains,
  initialLinks,
  cnameTarget,
  canWrite,
  canDelete,
  search,
  onSearchChange,
}: {
  initialDomains: ShortlinkDomain[];
  initialLinks: ShortlinkLink[];
  cnameTarget: string;
  canWrite: boolean;
  canDelete: boolean;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const [domains, setDomains] = useState<ShortlinkDomain[]>(initialDomains);
  const [links, setLinks] = useState<ShortlinkLink[]>(initialLinks);
  const [domainFilter, setDomainFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState<{
    domainId: string;
    longUrl: string;
    slug: string;
    expiresIn: Exclude<ExpiryId, "custom">;
    passphraseOn: boolean;
    passphrase: string;
  }>(() => {
    const stored = typeof window === "undefined" ? null : localStorage.getItem(LAST_DOMAIN_KEY);
    const remembered =
      stored && initialDomains.some((domain) => domain.id === stored) ? stored : null;
    return {
      domainId: remembered ?? lastUsedDomainId(initialDomains),
      longUrl: "",
      slug: "",
      expiresIn: "never",
      passphraseOn: false,
      passphrase: "",
    };
  });

  const [editing, setEditing] = useState<ShortlinkLink | null>(null);
  const [editForm, setEditForm] = useState({
    longUrl: "",
    slug: "",
    domainId: "",
    expiresIn: "never" as ExpiryId,
    passphraseMode: "keep" as "keep" | "set" | "remove",
    passphrase: "",
  });
  const [editBusy, setEditBusy] = useState(false);

  const [analyticsId, setAnalyticsId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<LinkAnalytics | null>(null);
  const [analyticsBusy, setAnalyticsBusy] = useState(false);

  const [domainsOpen, setDomainsOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [domainBusy, setDomainBusy] = useState(false);
  const [cfDomainId, setCfDomainId] = useState<string | null>(null);
  const [cfToken, setCfToken] = useState("");
  const [cfBusy, setCfBusy] = useState(false);
  const [cfResult, setCfResult] = useState<CloudflareSetupResult | null>(null);

  const formRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const [linksResponse, domainsResponse] = await Promise.all([
      fetch("/api/admin/links"),
      fetch("/api/admin/links/domains"),
    ]);
    if (linksResponse.ok) {
      const body = (await linksResponse.json()) as { links: ShortlinkLink[] };
      setLinks(body.links);
    }
    if (domainsResponse.ok) {
      const body = (await domainsResponse.json()) as { domains: ShortlinkDomain[] };
      setDomains(body.domains);
    }
  }, []);

  // Keep other open admin tabs in step, the way the other workspaces do.
  useEffect(() => {
    const channel = new BroadcastChannel("mgm-links-cms");
    const onMessage = () => void refresh();
    const onEvent = () => void refresh();
    channel.addEventListener("message", onMessage);
    window.addEventListener("mgm:links-updated", onEvent);
    return () => {
      channel.close();
      window.removeEventListener("mgm:links-updated", onEvent);
    };
  }, [refresh]);

  // The rail's "Shorten a link" button lives outside this component.
  useEffect(() => {
    const onFocusForm = () => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener("mgm:links-focus-form", onFocusForm);
    return () => window.removeEventListener("mgm:links-focus-form", onFocusForm);
  }, []);

  const announce = () => {
    window.dispatchEvent(new Event("mgm:links-updated"));
    try {
      new BroadcastChannel("mgm-links-cms").postMessage("updated");
    } catch {
      // BroadcastChannel is a nicety; the window event already covers this tab.
    }
  };

  const filteredLinks = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return links.filter((link) => {
      if (domainFilter && link.domainId !== domainFilter) return false;
      if (!needle) return true;
      return (
        link.slug.toLowerCase().includes(needle) ||
        link.longUrl.toLowerCase().includes(needle) ||
        link.shortUrl.toLowerCase().includes(needle)
      );
    });
  }, [links, search, domainFilter]);

  const createLink = async () => {
    const longUrl = form.longUrl.trim();
    if (!URL_PATTERN.test(longUrl)) {
      toast.error("Use a full URL", {
        description: "The long link must start with http:// or https://",
      });
      return;
    }
    const slug = form.slug.trim();
    if (slug && !SLUG_PATTERN.test(slug)) {
      toast.error("That short code won't work", {
        description: "Use letters, numbers, hyphens and underscores only.",
      });
      return;
    }
    if (form.passphraseOn && !form.passphrase) {
      toast.error("Add a passphrase", {
        description: "Turn the switch off if the link is public.",
      });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domainId: form.domainId,
          longUrl,
          slug: slug || undefined,
          expiresIn: form.expiresIn,
          passphrase: form.passphraseOn ? form.passphrase : undefined,
        }),
      });
      const body = await jsonOrThrow<{ link: ShortlinkLink }>(response);
      setLinks((current) => [body.link, ...current]);
      localStorage.setItem(LAST_DOMAIN_KEY, form.domainId);
      setForm((current) => ({
        ...current,
        longUrl: "",
        slug: "",
        passphrase: "",
        passphraseOn: false,
      }));
      announce();
      toast.success("Link shortened", { description: body.link.shortUrl });
    } catch (error) {
      toast.error("Could not shorten", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const copyShortUrl = async (shortUrl: string) => {
    try {
      await navigator.clipboard.writeText(shortUrl);
      toast.success("Link copied", { description: shortUrl });
    } catch {
      toast.error("Could not copy the link");
    }
  };

  const openEdit = (link: ShortlinkLink) => {
    setEditing(link);
    setEditForm({
      longUrl: link.longUrl,
      slug: link.slug,
      domainId: link.domainId,
      expiresIn: expiryOf(link),
      passphraseMode: "keep",
      passphrase: "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const longUrl = editForm.longUrl.trim();
    if (!URL_PATTERN.test(longUrl)) {
      toast.error("Use a full URL", {
        description: "The long link must start with http:// or https://",
      });
      return;
    }
    if (!SLUG_PATTERN.test(editForm.slug.trim())) {
      toast.error("That short code won't work", {
        description: "Use letters, numbers, hyphens and underscores only.",
      });
      return;
    }
    if (editForm.passphraseMode === "set" && !editForm.passphrase) {
      toast.error("Add a passphrase", { description: "Pick keep or remove if it stays as it is." });
      return;
    }
    setEditBusy(true);
    try {
      const response = await fetch(`/api/admin/links/${editing.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domainId: editForm.domainId,
          longUrl,
          slug: editForm.slug.trim(),
          expiresIn: editForm.expiresIn === "custom" ? undefined : editForm.expiresIn,
          passphraseAction: editForm.passphraseMode,
          passphrase: editForm.passphraseMode === "set" ? editForm.passphrase : undefined,
        }),
      });
      const body = await jsonOrThrow<{ link: ShortlinkLink }>(response);
      setLinks((current) => current.map((link) => (link.id === body.link.id ? body.link : link)));
      setEditing(null);
      announce();
      toast.success("Link updated");
    } catch (error) {
      toast.error("Could not save", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setEditBusy(false);
    }
  };

  const deleteLink = async (link: ShortlinkLink) => {
    if (!window.confirm(`Delete ${link.shortUrl}? Its analytics go with it.`)) return;
    try {
      const response = await fetch(`/api/admin/links/${link.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed.");
      setLinks((current) => current.filter((item) => item.id !== link.id));
      if (analyticsId === link.id) setAnalyticsId(null);
      announce();
      toast.success("Link deleted");
    } catch {
      toast.error("Could not delete the link");
    }
  };

  const toggleAnalytics = async (link: ShortlinkLink) => {
    if (analyticsId === link.id) {
      setAnalyticsId(null);
      return;
    }
    setAnalyticsId(link.id);
    setAnalyticsBusy(true);
    try {
      const response = await fetch(`/api/admin/links/${link.id}/analytics`);
      const body = await jsonOrThrow<LinkAnalytics>(response);
      setAnalytics(body);
    } catch (error) {
      toast.error("Could not load analytics", {
        description: error instanceof Error ? error.message : undefined,
      });
      setAnalyticsId(null);
    } finally {
      setAnalyticsBusy(false);
    }
  };

  const addDomain = async () => {
    const hostname = newDomain.trim();
    if (!hostname) return;
    setDomainBusy(true);
    try {
      const response = await fetch("/api/admin/links/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostname }),
      });
      const body = await jsonOrThrow<{ domain: ShortlinkDomain; railwayNote?: string | null }>(
        response,
      );
      setDomains((current) => [...current, body.domain]);
      setNewDomain("");
      announce();
      toast.success("Domain added", { description: body.railwayNote ?? undefined });
    } catch (error) {
      toast.error("Could not add the domain", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setDomainBusy(false);
    }
  };

  const deleteDomain = async (domain: ShortlinkDomain) => {
    if (!window.confirm(`Remove ${domain.hostname}? Its DNS records stay in place.`)) return;
    setDomainBusy(true);
    try {
      const response = await fetch(`/api/admin/links/domains/${domain.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed.");
      setDomains((current) => current.filter((item) => item.id !== domain.id));
      announce();
      toast.success("Domain removed");
    } catch {
      toast.error("Could not remove the domain");
    } finally {
      setDomainBusy(false);
    }
  };

  const checkDomain = async (domain: ShortlinkDomain) => {
    setDomainBusy(true);
    try {
      const response = await fetch(`/api/admin/links/domains/${domain.id}`);
      const body = await jsonOrThrow<{ domain: ShortlinkDomain }>(response);
      setDomains((current) => current.map((item) => (item.id === domain.id ? body.domain : item)));
      announce();
      toast.success(
        body.domain.status === "connected" ? `${domain.hostname} is live` : "Not live yet",
        {
          description:
            body.domain.status === "connected"
              ? undefined
              : "DNS changes can take a few minutes to spread.",
        },
      );
    } catch {
      toast.error("Could not check the domain");
    } finally {
      setDomainBusy(false);
    }
  };

  const autoconfigureCloudflare = async (domain: ShortlinkDomain) => {
    if (!cfToken.trim()) {
      toast.error("Add the Cloudflare token first", {
        description: "It is stored encrypted and only used for this domain.",
      });
      return;
    }
    setCfBusy(true);
    setCfResult(null);
    try {
      const response = await fetch(`/api/admin/links/domains/${domain.id}/cloudflare`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: cfToken }),
      });
      const body = await jsonOrThrow<CloudflareSetupResult>(response);
      setCfResult(body);
      toast.success("Cloudflare configured", {
        description: body.railwayAttached
          ? "DNS records are in place. Give DNS a few minutes, then check the domain."
          : "DNS records are in place. Attach the domain in Railway, then check it.",
      });
    } catch (error) {
      toast.error("Cloudflare setup failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCfBusy(false);
    }
  };

  const domainOptions = domains
    .map((domain) => ({
      ...domain,
      label: `${domain.hostname}${domain.isPrimary ? " (site)" : domain.status === "pending" ? " (pending)" : ""}`,
    }))
    .sort(
      (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.hostname.localeCompare(b.hostname),
    );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <LinkSimple className="text-brand-green" size={26} weight="duotone" />
        <div>
          <h2 className="text-lg font-bold">Link shortener</h2>
          <p className="text-sm text-[#778299] dark:text-white/45">
            Short links on {domains.find((domain) => domain.isPrimary)?.hostname ?? "your domain"}
            /s/ and any custom domain you connect.
          </p>
        </div>
      </div>

      {canWrite ? (
        <div
          ref={formRef}
          className="rounded-2xl border border-[#e4e8f0] bg-white p-5 dark:border-white/10 dark:bg-white/[0.02]"
        >
          <div className={`${labelClass} mb-3`}>Shorten a link</div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px_auto]">
            <Field label="Long link">
              <input
                className={inputClass}
                onChange={(event) =>
                  setForm((current) => ({ ...current, longUrl: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createLink();
                }}
                placeholder="https://example.com/a-very-long-url"
                value={form.longUrl}
              />
            </Field>
            <Field label="Domain">
              <select
                className={inputClass}
                onChange={(event) => {
                  setForm((current) => ({ ...current, domainId: event.target.value }));
                  localStorage.setItem(LAST_DOMAIN_KEY, event.target.value);
                }}
                value={form.domainId}
              >
                {domainOptions.map((domain) => (
                  <option disabled={domain.status === "pending"} key={domain.id} value={domain.id}>
                    {domain.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-blue px-5 text-sm font-semibold text-white transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
                disabled={busy || !canWrite}
                onClick={() => void createLink()}
                type="button"
              >
                <Plus size={16} weight="bold" />
                Shorten
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[200px_200px_minmax(0,1fr)_auto]">
            <Field label="Short code (optional)">
              <input
                className={`${inputClass} font-mono`}
                onChange={(event) =>
                  setForm((current) => ({ ...current, slug: event.target.value }))
                }
                placeholder="auto"
                value={form.slug}
              />
            </Field>
            <Field label="Expires">
              <select
                className={inputClass}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    expiresIn: event.target.value as Exclude<ExpiryId, "custom">,
                  }))
                }
                value={form.expiresIn}
              >
                {EXPIRY_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Require a passphrase?">
              <div className="flex items-center gap-3">
                <button
                  aria-checked={form.passphraseOn}
                  aria-label="Require a passphrase"
                  className={`relative h-6 w-11 rounded-full transition ${
                    form.passphraseOn ? "bg-brand-blue" : "bg-[#d6dbe6] dark:bg-white/15"
                  }`}
                  onClick={() =>
                    setForm((current) => ({ ...current, passphraseOn: !current.passphraseOn }))
                  }
                  role="switch"
                  type="button"
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      form.passphraseOn ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
                {form.passphraseOn ? (
                  <input
                    className={`${inputClass} flex-1`}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, passphrase: event.target.value }))
                    }
                    placeholder="Passphrase"
                    type="password"
                    value={form.passphrase}
                  />
                ) : (
                  <span className="text-xs text-[#9ba4b5] dark:text-white/35">Public link</span>
                )}
              </div>
            </Field>
            <div className="flex items-end">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9dfeb] px-4 text-sm font-semibold text-[#3b4150] transition hover:bg-[#f7f8fa] dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
                onClick={() => setDomainsOpen(true)}
                type="button"
              >
                <Globe size={16} />
                Domains
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-[#e4e8f0] bg-white p-5 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="flex flex-wrap items-center gap-3">
          <div className={`${labelClass} mr-auto`}>
            {filteredLinks.length} link{filteredLinks.length === 1 ? "" : "s"}
          </div>
          <div className="relative">
            <MagnifyingGlass
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8490a5]"
              size={16}
            />
            <input
              className={`${inputClass} w-56 pl-9`}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search links"
              value={search}
            />
          </div>
          <select
            className={`${inputClass} w-44`}
            onChange={(event) => setDomainFilter(event.target.value)}
            value={domainFilter}
          >
            <option value="">All domains</option>
            {domainOptions.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.hostname}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 space-y-2">
          {filteredLinks.map((link) => (
            <div key={link.id}>
              <div className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition hover:border-[#e4e8f0] hover:bg-[#fbfbfa] dark:hover:border-white/10 dark:hover:bg-white/[0.03]">
                <button
                  aria-label="Copy short link"
                  className="rounded-lg p-1.5 text-[#9ba4b5] transition hover:bg-white hover:text-brand-blue dark:hover:bg-white/10"
                  onClick={() => void copyShortUrl(link.shortUrl)}
                  title="Copy short link"
                  type="button"
                >
                  <Copy size={16} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-sm font-semibold">
                      {link.shortUrl}
                    </span>
                    <StatusBadge status={link.status} />
                    {link.hasPassphrase ? (
                      <span
                        className={`${chipClass} bg-brand-blue-50 text-brand-blue`}
                        title="Protected by a passphrase"
                      >
                        Protected
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-xs text-[#778299] dark:text-white/45">
                    {link.longUrl}
                  </div>
                </div>
                <div className="hidden shrink-0 gap-5 text-right sm:flex">
                  <div>
                    <div className="font-mono text-sm font-semibold tabular-nums">
                      {link.viewCount}
                    </div>
                    <div className={labelClass}>Views</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm font-semibold tabular-nums">
                      {link.clickCount}
                    </div>
                    <div className={labelClass}>Clicks</div>
                  </div>
                  <div>
                    <div className="text-sm text-[#3b4150] dark:text-white/70">
                      {new Date(link.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className={labelClass}>Created</div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    aria-label="Analytics"
                    className={`rounded-lg p-2 transition ${
                      analyticsId === link.id
                        ? "bg-brand-blue text-white"
                        : "text-[#778299] hover:bg-white hover:text-brand-blue dark:text-white/45 dark:hover:bg-white/10 dark:hover:text-white"
                    }`}
                    onClick={() => void toggleAnalytics(link)}
                    title="Analytics"
                    type="button"
                  >
                    <ChartBar size={16} />
                  </button>
                  {canWrite ? (
                    <button
                      aria-label="Edit link"
                      className="rounded-lg p-2 text-[#778299] transition hover:bg-white hover:text-brand-blue dark:text-white/45 dark:hover:bg-white/10 dark:hover:text-white"
                      onClick={() => openEdit(link)}
                      title="Edit link"
                      type="button"
                    >
                      <PencilSimple size={16} />
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      aria-label="Delete link"
                      className="rounded-lg p-2 text-[#778299] transition hover:bg-white hover:text-brand-red dark:text-white/45 dark:hover:bg-white/10 dark:hover:text-white"
                      onClick={() => void deleteLink(link)}
                      title="Delete link"
                      type="button"
                    >
                      <Trash size={16} />
                    </button>
                  ) : null}
                </div>
              </div>
              {analyticsId === link.id ? (
                <div className="pb-2">
                  {analyticsBusy ? (
                    <p className="px-3 py-4 text-xs text-[#9ba4b5]">Loading analytics…</p>
                  ) : analytics ? (
                    <AnalyticsPanel analytics={analytics} onClose={() => setAnalyticsId(null)} />
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
          {filteredLinks.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-[#9ba4b5] dark:text-white/35">
              {links.length === 0
                ? "No links yet. Shorten your first link above."
                : "No links match that search."}
            </p>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div
          aria-label="Edit link"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e1116]/45 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setEditing(null);
          }}
          role="dialog"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[#e4e8f0] bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1c212a]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold">Edit {editing.shortUrl}</h3>
              <button
                aria-label="Close"
                className="rounded-lg p-1.5 text-[#7e899d] transition hover:bg-[#f7f8fa] dark:hover:bg-white/10"
                onClick={() => setEditing(null)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="Long link">
                <input
                  className={inputClass}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, longUrl: event.target.value }))
                  }
                  value={editForm.longUrl}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Short code">
                  <input
                    className={`${inputClass} font-mono`}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, slug: event.target.value }))
                    }
                    value={editForm.slug}
                  />
                </Field>
                <Field label="Domain">
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, domainId: event.target.value }))
                    }
                    value={editForm.domainId}
                  >
                    {domainOptions.map((domain) => (
                      <option
                        disabled={domain.status === "pending" && domain.id !== editing.domainId}
                        key={domain.id}
                        value={domain.id}
                      >
                        {domain.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Expires">
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        expiresIn: event.target.value as ExpiryId,
                      }))
                    }
                    value={editForm.expiresIn}
                  >
                    {EXPIRY_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                    {editForm.expiresIn === "custom" ? (
                      <option value="custom">
                        Custom (
                        {editing.expiresAt ? new Date(editing.expiresAt).toLocaleDateString() : ""})
                      </option>
                    ) : null}
                  </select>
                </Field>
                <Field label="Passphrase">
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        passphraseMode: event.target.value as "keep" | "set" | "remove",
                      }))
                    }
                    value={editForm.passphraseMode}
                  >
                    <option value="keep">
                      {editing.hasPassphrase ? "Keep current" : "No passphrase"}
                    </option>
                    <option value="set">
                      {editing.hasPassphrase ? "Set a new one" : "Add one"}
                    </option>
                    {editing.hasPassphrase ? <option value="remove">Remove it</option> : null}
                  </select>
                </Field>
              </div>
              {editForm.passphraseMode === "set" ? (
                <Field label="New passphrase">
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, passphrase: event.target.value }))
                    }
                    type="password"
                    value={editForm.passphrase}
                  />
                </Field>
              ) : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="h-10 rounded-xl border border-[#d9dfeb] px-4 text-sm font-semibold text-[#3b4150] transition hover:bg-[#f7f8fa] dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
                onClick={() => setEditing(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="h-10 rounded-xl bg-brand-blue px-5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
                disabled={editBusy}
                onClick={() => void saveEdit()}
                type="button"
              >
                {editBusy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {domainsOpen ? (
        <div
          aria-label="Custom domains"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e1116]/45 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDomainsOpen(false);
          }}
          role="dialog"
        >
          <div className="w-full max-w-xl rounded-2xl border border-[#e4e8f0] bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1c212a]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold">Custom domains</h3>
              <button
                aria-label="Close"
                className="rounded-lg p-1.5 text-[#7e899d] transition hover:bg-[#f7f8fa] dark:hover:bg-white/10"
                onClick={() => setDomainsOpen(false)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mb-4 text-xs leading-5 text-[#778299] dark:text-white/45">
              A custom domain serves short links at its root (
              {domains.find((domain) => !domain.isPrimary)?.hostname ?? "mgm.li"}
              /slug). Point it at the site with a CNAME and it goes live the moment it verifies.
            </p>
            <div className="space-y-3">
              {domains
                .filter((domain) => !domain.isPrimary)
                .map((domain) => (
                  <div
                    className="rounded-xl border border-[#e4e8f0] p-4 dark:border-white/10"
                    key={domain.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{domain.hostname}</span>
                      {domain.status === "connected" ? (
                        <span className={`${chipClass} bg-brand-green-50 text-brand-green`}>
                          Live
                        </span>
                      ) : (
                        <span
                          className={`${chipClass} bg-[#eef0f4] text-[#5c6470] dark:bg-white/10 dark:text-white/50`}
                        >
                          Pending
                        </span>
                      )}
                      {domain.provider === "cloudflare" ? (
                        <span
                          className={`${chipClass} bg-[#fef6e0] text-[#a97b1c]`}
                          title="Hosted on Cloudflare"
                        >
                          Cloudflare
                        </span>
                      ) : (
                        <span
                          className={`${chipClass} bg-[#eef0f4] text-[#5c6470] dark:bg-white/10 dark:text-white/50`}
                        >
                          Manual DNS
                        </span>
                      )}
                      <span className="ml-auto text-xs text-[#9ba4b5]">
                        {domain.linkCount} link{domain.linkCount === 1 ? "" : "s"}
                      </span>
                      <button
                        aria-label="Check domain now"
                        className="rounded-lg p-1.5 text-[#778299] transition hover:bg-[#f7f8fa] hover:text-brand-blue dark:hover:bg-white/10"
                        disabled={domainBusy}
                        onClick={() => void checkDomain(domain)}
                        title="Check now"
                        type="button"
                      >
                        <ArrowsClockwise size={16} />
                      </button>
                      {canDelete ? (
                        <button
                          aria-label="Remove domain"
                          className="rounded-lg p-1.5 text-[#778299] transition hover:bg-[#f7f8fa] hover:text-brand-red dark:hover:bg-white/10"
                          disabled={domainBusy}
                          onClick={() => void deleteDomain(domain)}
                          title="Remove domain"
                          type="button"
                        >
                          <Trash size={16} />
                        </button>
                      ) : null}
                    </div>
                    {domain.status !== "connected" ? (
                      <div className="mt-3 border-t border-[#eef0f4] pt-3 dark:border-white/5">
                        <p className="text-xs leading-5 text-[#778299] dark:text-white/45">
                          Add a CNAME record for{" "}
                          <span className="font-mono">{domain.hostname}</span> pointing to{" "}
                          <span className="font-mono">{cnameTarget}</span>.
                        </p>
                        {domain.provider === "cloudflare" ? (
                          <div className="mt-3">
                            <button
                              className="inline-flex h-9 items-center gap-2 rounded-xl border border-brand-blue/40 bg-brand-blue/[0.06] px-3.5 text-xs font-semibold text-brand-blue transition hover:bg-brand-blue hover:text-white disabled:opacity-50"
                              disabled={cfBusy || !canWrite}
                              onClick={() =>
                                setCfDomainId(cfDomainId === domain.id ? null : domain.id)
                              }
                              type="button"
                            >
                              <CloudArrowUp size={16} />
                              {cfDomainId === domain.id ? "Close setup" : "Set up on Cloudflare"}
                            </button>
                            {cfDomainId === domain.id ? (
                              <div className="mt-3 space-y-2 rounded-xl bg-[#fbfbfa] p-3 dark:bg-white/[0.03]">
                                <p className="text-xs leading-5 text-[#778299] dark:text-white/45">
                                  Paste a Cloudflare API token with Zone · DNS · Edit for{" "}
                                  <span className="font-mono">{domain.hostname}</span>. It is stored
                                  encrypted and used only to create the DNS records.
                                </p>
                                <div className="flex gap-2">
                                  <input
                                    className={`${inputClass} font-mono`}
                                    onChange={(event) => setCfToken(event.target.value)}
                                    placeholder="Cloudflare API token"
                                    type="password"
                                    value={cfToken}
                                  />
                                  <button
                                    className="h-10 shrink-0 rounded-xl bg-brand-blue px-4 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
                                    disabled={cfBusy || !cfToken.trim()}
                                    onClick={() => void autoconfigureCloudflare(domain)}
                                    type="button"
                                  >
                                    {cfBusy ? "Working…" : "Autoconfigure"}
                                  </button>
                                </div>
                                {cfResult ? (
                                  <p className="text-xs leading-5 text-brand-green">
                                    Created the CNAME for{" "}
                                    <span className="font-mono">{cfResult.cname.name}</span> →{" "}
                                    <span className="font-mono">{cfResult.cname.content}</span>
                                    {cfResult.txt
                                      ? ` and the verification TXT on ${cfResult.txt.name}`
                                      : ""}
                                    . DNS can take a few minutes; use “Check now” to verify.
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              {domains.filter((domain) => !domain.isPrimary).length === 0 ? (
                <p className="rounded-xl border border-dashed border-[#d9dfeb] px-4 py-6 text-center text-sm text-[#9ba4b5] dark:border-white/10 dark:text-white/35">
                  No custom domains yet.
                </p>
              ) : null}
            </div>
            {canWrite ? (
              <div className="mt-4 flex gap-2 border-t border-[#eef0f4] pt-4 dark:border-white/5">
                <input
                  className={`${inputClass} flex-1`}
                  onChange={(event) => setNewDomain(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void addDomain();
                  }}
                  placeholder="your-domain.com"
                  value={newDomain}
                />
                <button
                  className="h-10 shrink-0 rounded-xl border border-dashed border-brand-green/45 bg-brand-green/[0.04] px-4 text-sm font-semibold text-brand-green transition hover:bg-brand-green hover:text-white disabled:opacity-50"
                  disabled={domainBusy || !newDomain.trim()}
                  onClick={() => void addDomain()}
                  type="button"
                >
                  Add domain
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
