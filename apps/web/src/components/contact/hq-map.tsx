"use client";

import "maplibre-gl/dist/maplibre-gl.css";

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

/**
 * The keyless fallback: MapLibre GL rendering OpenFreeMap's "Liberty" vector
 * style — no API key, no usage quota, used whenever Google isn't available.
 */
function MapLibreFallback({ lat, lng }: { lat: number; lng: number }) {
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
      new Marker().setLngLat([lng, lat]).setPopup(new Popup().setText("MGM Laboratory")).addTo(map);
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng]);

  return <div className="h-40 w-full" ref={containerRef} />;
}

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
    return () => {
      cancelled = true;
      marker?.setMap(null);
    };
  }, [apiKey, lat, lng]);

  return (
    <div className="h-40 w-full overflow-hidden rounded-xl border border-[var(--line)] [&_.maplibregl-ctrl-attrib]:text-[10px] dark:brightness-[0.85] dark:contrast-[1.15] dark:saturate-[0.8]">
      {googleFailed ? (
        <MapLibreFallback lat={lat} lng={lng} />
      ) : (
        <div className="h-40 w-full" ref={containerRef} />
      )}
    </div>
  );
}
