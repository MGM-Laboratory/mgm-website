/** Types for the link shortener workspace, shared by the server fetch and the editor. */

export type DomainRecords = {
  cname: { name: string; content: string };
  verifyTxt: { name: string; content: string };
  railwayTxt: { name: string; content: string } | null;
};

export type ShortlinkDomain = {
  id: string;
  hostname: string;
  isPrimary: boolean;
  provider: "local" | "cloudflare" | "manual";
  status: "connected" | "pending";
  railwayAttached: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  linkCount: number;
  /** The DNS records to apply or copy, for custom domains. */
  records?: DomainRecords;
};

export type DomainChecks = {
  verifyTxt: boolean;
  railway: boolean;
  marker: boolean;
};

export type ConnectResult = {
  /** The signed Domain Connect apply URL; null until Cloudflare onboarding is done. */
  url: string | null;
  records: DomainRecords;
};

export type LinkStatus = "available" | "expired" | "consumed" | "error";

export type ShortlinkLink = {
  id: string;
  slug: string;
  longUrl: string;
  shortUrl: string;
  domainId: string;
  domainHost: string;
  status: LinkStatus;
  clickCount: number;
  viewCount: number;
  hasPassphrase: boolean;
  expiresAt: string | null;
  maxClicks: number | null;
  createdAt: string;
  updatedAt: string;
};

export type LinkAnalytics = {
  link: ShortlinkLink;
  totals: { views: number; clicks: number; uniqueIps: number; failedAttempts: number };
  days: { day: string; views: number; clicks: number }[];
  countries: { country: string; visits: number }[];
  referrers: { host: string; visits: number }[];
  browsers: { browser: string; visits: number }[];
  oss: { os: string; visits: number }[];
  devices: { device: string; visits: number }[];
  recent: {
    id: string;
    ip: string | null;
    userAgent: string | null;
    referer: string | null;
    isView: boolean;
    isClick: boolean;
    failedAttempt: boolean;
    country: string | null;
    region: string | null;
    city: string | null;
    timezone: string | null;
    device: string | null;
    browser: string | null;
    os: string | null;
    createdAt: string;
  }[];
};

export const EXPIRY_OPTIONS: {
  id: "once" | "24h" | "3d" | "7d" | "30d" | "never";
  label: string;
}[] = [
  { id: "never", label: "Never expires" },
  { id: "once", label: "Once" },
  { id: "24h", label: "24 hours" },
  { id: "3d", label: "3 days" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
];

export const STATUS_LABEL: Record<LinkStatus, string> = {
  available: "Available",
  expired: "Expired",
  consumed: "Used up",
  error: "Link error",
};

export const STATUS_HINT: Record<LinkStatus, string> = {
  available: "The link redirects.",
  expired: "Its expiry date has passed.",
  consumed: "It was single-use and its click is spent.",
  error:
    "The destination did not answer the health check. The link still redirects, but it may be down.",
};
