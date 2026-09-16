"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { env } from "@/lib/env";
import { loadGoogleMaps } from "@/lib/google-maps-loader";

// OpenFreeMap's Liberty style needs no API key/billing, so it's the fallback
// whenever Google Maps has no key configured or fails to load.
const OPENFREEMAP_LIBERTY_STYLE = "https://tiles.openfreemap.org/styles/liberty";

/**
 * Google Maps when a browser API key is configured and loads successfully;
 * otherwise (or on failure) a keyless MapLibre GL JS map styled with
 * OpenFreeMap's Liberty tiles — never a broken or empty box.
 */
export function HqMap({ lat, lng }: Readonly<{ lat: number; lng: number }>) {
  const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const [useFallback, setUseFallback] = useState(!apiKey);

  useEffect(() => {
    if (useFallback || !apiKey || !containerRef.current) return;
    let cancelled = false;
    let marker: google.maps.Marker | undefined;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const position = { lat, lng };
        const map = new google.maps.Map(containerRef.current, {
          center: position,
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: true,
        });
        marker = new google.maps.Marker({ map, position, title: "MGM Laboratory" });
      })
      .catch(() => {
        if (!cancelled) setUseFallback(true);
      });
    return () => {
      cancelled = true;
      marker?.setMap(null);
    };
  }, [useFallback, apiKey, lat, lng]);

  useEffect(() => {
    if (!useFallback || !containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: OPENFREEMAP_LIBERTY_STYLE,
      center: [lng, lat],
      zoom: 15,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl(), "top-right");
    new Marker().setLngLat([lng, lat]).addTo(map);
    return () => map.remove();
  }, [useFallback, lat, lng]);

  return (
    <div
      ref={containerRef}
      className="h-40 w-full overflow-hidden rounded-xl border border-[var(--line)] [&_.maplibregl-ctrl-attrib]:text-[10px] dark:brightness-[0.85] dark:contrast-[1.15] dark:saturate-[0.8]"
    />
  );
}
