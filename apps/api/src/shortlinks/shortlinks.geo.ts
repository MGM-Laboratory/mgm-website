import { isIP } from "node:net";

import type { PrismaService } from "../prisma/prisma.service.js";

type GeoResult = {
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
};

// ipwho.is is free, keyless and HTTPS. Results are cached in-process (keyed
// by IP) so repeat visitors cost nothing; the map is bounded to keep memory
// flat on long-running deployments.
const geoCache = new Map<string, GeoResult | null>();
const GEO_CACHE_MAX = 5000;

function isRoutableAddress(ip: string): boolean {
  if (ip === "::1") return false;
  if (ip.includes(":") || ip.includes(".")) {
    if (isIP(ip) === 0) return false;
  }
  const privateV4 =
    /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|2(2[4-9]|[3-9]\d)\.)/;
  if (privateV4.test(ip)) return false;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return false;
  return true;
}

export async function lookupGeo(ip: string): Promise<GeoResult | null> {
  if (!isRoutableAddress(ip)) return null;
  const cached = geoCache.get(ip);
  if (cached !== undefined) return cached;

  let result: GeoResult | null = null;
  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      const data = (await response.json()) as {
        success?: boolean;
        country?: string;
        region?: string;
        city?: string;
        latitude?: number;
        longitude?: number;
        timezone?: { id?: string };
      };
      if (data.success && data.country) {
        result = {
          country: data.country,
          region: data.region,
          city: data.city,
          latitude: data.latitude,
          longitude: data.longitude,
          timezone: data.timezone?.id,
        };
      }
    }
  } catch {
    // Geolocation is a nice-to-have; a failing provider must never affect
    // the redirect itself.
  }

  if (geoCache.size >= GEO_CACHE_MAX) {
    const oldest = geoCache.keys().next().value as string | undefined;
    if (oldest !== undefined) geoCache.delete(oldest);
  }
  geoCache.set(ip, result);
  return result;
}

/**
 * Fire-and-forget enrichment of a stored visit row: the redirect is already
 * on its way by the time this resolves.
 */
export function enrichVisit(prisma: PrismaService, visitId: string, ip: string | null): void {
  if (!ip) return;
  void lookupGeo(ip)
    .then((geo) => {
      if (!geo) return;
      return prisma.shortLinkVisit.update({ where: { id: visitId }, data: geo });
    })
    .catch(() => {
      // A visit row can vanish (link deleted) between the write and here.
    });
}
