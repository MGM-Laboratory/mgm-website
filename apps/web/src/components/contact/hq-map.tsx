"use client";

import { ArrowSquareOut, MapPin } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { env } from "@/lib/env";
import { loadGoogleMaps } from "@/lib/google-maps-loader";

/**
 * Google Maps only. Any failure to load or authenticate (or no key
 * configured at all) falls back to a plain "Open in Google Maps" link
 * instead of a broken or empty box.
 */
export function HqMap({ lat, lng }: Readonly<{ lat: number; lng: number }>) {
  const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const [googleFailed, setGoogleFailed] = useState(!apiKey);

  useEffect(() => {
    if (!apiKey || !containerRef.current) return;
    let cancelled = false;
    let marker: google.maps.Marker | undefined;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const position = { lat, lng };
        const map = new google.maps.Map(containerRef.current, {
          center: position,
          disableDefaultUI: true,
          zoom: 16,
          zoomControl: true,
        });
        marker = new google.maps.Marker({ map, position, title: "MGM Laboratory" });
      })
      .catch(() => {
        if (!cancelled) setGoogleFailed(true);
      });
    // skipcq: JS-0045 -- standard useEffect cleanup return
    return () => {
      cancelled = true;
      marker?.setMap(null);
    };
  }, [apiKey, lat, lng]);

  if (googleFailed) {
    return (
      <div className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-center">
        <MapPin className="text-[var(--ink-3)]" size={18} weight="bold" />
        <a
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline"
          href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
          rel="noreferrer noopener"
          target="_blank"
        >
          Open in Google Maps <ArrowSquareOut size={14} weight="bold" />
        </a>
      </div>
    );
  }

  return (
    <div
      className="h-40 w-full overflow-hidden rounded-xl border border-[var(--line)] dark:brightness-[0.85] dark:contrast-[1.15] dark:saturate-[0.8]"
      ref={containerRef}
    />
  );
}
