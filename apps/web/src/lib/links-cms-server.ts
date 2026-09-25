import "server-only";

import { cmsApi } from "@/lib/cms-api";

import type { ShortlinkDomain, ShortlinkLink } from "@/lib/links-cms";

export type LinksAdminSnapshot = {
  domains: ShortlinkDomain[];
  links: ShortlinkLink[];
};

/** The initial workspace data, fetched server-side before the studio mounts. */
export async function fetchLinksAdminSnapshot(): Promise<LinksAdminSnapshot> {
  const [domainsResponse, linksResponse] = await Promise.all([
    cmsApi("/shortlinks/admin/domains"),
    cmsApi("/shortlinks/admin/links"),
  ]);
  const domainsBody = domainsResponse.ok
    ? ((await domainsResponse.json()) as { domains?: ShortlinkDomain[] })
    : null;
  const linksBody = linksResponse.ok
    ? ((await linksResponse.json()) as { links?: ShortlinkLink[] })
    : null;
  return {
    domains: domainsBody?.domains ?? [],
    links: linksBody?.links ?? [],
  };
}
