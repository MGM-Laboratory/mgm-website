"use client";

import { ArrowSquareOut, MapPin } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { env } from "@/lib/env";
import { loadGoogleMaps } from "@/lib/google-maps-loader";

function openInMapsUrl({ lat, lng, mapsUrl, address }: EventMapProps) {
  if (mapsUrl) return mapsUrl;
  if (lat !== undefined && lng !== undefined) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address ?? "")}`;
}

type EventMapProps = {
  lat?: number;
  lng?: number;
  mapsUrl?: string;
  address?: string;
  label: string;
};

/**
 * An interactive Google Map when a browser API key and coordinates are both
 * available; otherwise a static address with an "Open in Google Maps" link
 * — never a broken or empty box.
 */
export function EventMap(props: EventMapProps) {
  const { lat, lng, address, label } = props;
  const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const canRenderMap = Boolean(apiKey) && lat !== undefined && lng !== undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canRenderMap || !containerRef.current) return;
    let cancelled = false;
    loadGoogleMaps(apiKey!)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const position = { lat: lat!, lng: lng! };
        const map = new google.maps.Map(containerRef.current, {
          center: position,
          zoom: 16,
          disableDefaultUI: false,
          zoomControl: true,
        });
        new google.maps.Marker({ map, position, title: label });
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRenderMap, lat, lng]);

  if (!canRenderMap || error) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-6">
        <p className="flex items-center gap-2 text-sm font-medium text-[var(--ink)] dark:text-white">
          <MapPin size={18} weight="bold" /> {address || label}
        </p>
        <a
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline"
          href={openInMapsUrl(props)}
          rel="noreferrer noopener"
          target="_blank"
        >
          Open in Google Maps <ArrowSquareOut size={14} weight="bold" />
        </a>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
      <div className="h-72 w-full sm:h-96" ref={containerRef} />
    </div>
  );
}
