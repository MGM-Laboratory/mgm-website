"use client";

import { ArrowSquareOut, MapPin } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { MapLibreFallback } from "@/components/maps/maplibre-fallback";
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
 * Google Maps is tried first whenever a browser API key is configured; any
 * failure to load or authenticate (or no key at all) falls back to the
 * MapLibre/OpenFreeMap renderer instead of a broken or empty box.
 */
export function EventMap(props: EventMapProps) {
  const { lat, lng, address, label } = props;
  const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const hasCoords = lat !== undefined && lng !== undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const [googleFailed, setGoogleFailed] = useState(!apiKey);

  useEffect(() => {
    if (!apiKey || !hasCoords || !containerRef.current) return;
    let cancelled = false;
    let marker: google.maps.Marker | undefined;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const position = { lat: lat!, lng: lng! };
        const map = new google.maps.Map(containerRef.current, {
          center: position,
          disableDefaultUI: false,
          zoom: 16,
          zoomControl: true,
        });
        marker = new google.maps.Marker({ map, position, title: label });
      })
      .catch(() => {
        if (!cancelled) setGoogleFailed(true);
      });
    return () => {
      cancelled = true;
      marker?.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, hasCoords, lat, lng]);

  if (!hasCoords) {
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
      {googleFailed ? (
        <MapLibreFallback label={label} lat={lat!} lng={lng!} className="h-72 w-full sm:h-96" />
      ) : (
        <div className="h-72 w-full sm:h-96" ref={containerRef} />
      )}
    </div>
  );
}
