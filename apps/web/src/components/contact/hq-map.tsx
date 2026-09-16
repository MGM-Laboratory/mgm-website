"use client";

import { useEffect, useRef, useState } from "react";

import { MapLibreFallback } from "@/components/maps/maplibre-fallback";
import { env } from "@/lib/env";
import { loadGoogleMaps } from "@/lib/google-maps-loader";

/**
 * Google Maps is tried first whenever a browser API key is configured; any
 * failure to load or authenticate (or no key at all) falls back to the
 * MapLibre/OpenFreeMap renderer instead of a broken or empty box.
 */
export function HqMap({ lat, lng }: Readonly<{ lat: number; lng: number }>) {
  const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const [googleFailed, setGoogleFailed] = useState(!apiKey);

  useEffect(() => {
    if (!apiKey || !containerRef.current) return null;
    let cancelled = false;
    let marker: google.maps.Marker | undefined;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return null;
        const position = { lat, lng };
        const map = new google.maps.Map(containerRef.current, {
          center: position,
          disableDefaultUI: true,
          zoom: 16,
          zoomControl: true,
        });
        marker = new google.maps.Marker({ map, position, title: "MGM Laboratory" });
        return null;
      })
      .catch(() => {
        if (!cancelled) setGoogleFailed(true);
        return null;
      });
    return () => {
      cancelled = true;
      marker?.setMap(null);
    };
  }, [apiKey, lat, lng]);

  return (
    <div className="h-40 w-full overflow-hidden rounded-xl border border-[var(--line)] [&_.maplibregl-ctrl-attrib]:text-[10px] dark:brightness-[0.85] dark:contrast-[1.15] dark:saturate-[0.8]">
      {googleFailed ? (
        <MapLibreFallback lat={lat} lng={lng} label="MGM Laboratory" className="h-40 w-full" />
      ) : (
        <div className="h-40 w-full" ref={containerRef} />
      )}
    </div>
  );
}
