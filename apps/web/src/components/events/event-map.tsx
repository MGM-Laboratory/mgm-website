"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { ArrowSquareOut, MapPin } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { env } from "@/lib/env";

declare global {
  interface Window {
    google?: { maps: typeof google.maps };
    gm_authFailure?: () => void;
  }
}

let scriptPromise: Promise<void> | undefined;

/**
 * Loads the Maps JS API exactly once. `gm_authFailure` is Google's own hook
 * for a missing/invalid/quota-exceeded key — the script itself still loads
 * successfully in that case, so `onerror` alone would miss it.
 */
function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      window.gm_authFailure = () => reject(new Error("Google Maps authentication failed."));
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load Google Maps."));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

function openInMapsUrl({ lat, lng, mapsUrl, address }: EventMapProps) {
  if (mapsUrl) return mapsUrl;
  if (lat !== undefined && lng !== undefined) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address ?? "")}`;
}

/**
 * The keyless fallback: MapLibre GL rendering OpenFreeMap's "Liberty" vector
 * style — no API key, no usage quota, used whenever Google isn't available.
 */
function MapLibreFallback({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    import("maplibre-gl").then(({ Map: MapLibreMap, Marker, NavigationControl, Popup }) => {
      if (cancelled || !containerRef.current) return;
      map = new MapLibreMap({
        center: [lng, lat],
        container: containerRef.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        zoom: 15,
      });
      map.addControl(new NavigationControl(), "top-right");
      new Marker().setLngLat([lng, lat]).setPopup(new Popup().setText(label)).addTo(map);
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng, label]);

  return <div className="h-72 w-full sm:h-96" ref={containerRef} />;
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
        new google.maps.Marker({ map, position, title: label });
      })
      .catch(() => {
        if (!cancelled) setGoogleFailed(true);
      });
    return () => {
      cancelled = true;
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
        <MapLibreFallback label={label} lat={lat!} lng={lng!} />
      ) : (
        <div className="h-72 w-full sm:h-96" ref={containerRef} />
      )}
    </div>
  );
}
