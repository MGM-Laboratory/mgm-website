"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef } from "react";

/**
 * The keyless fallback: MapLibre GL rendering OpenFreeMap's "Liberty" vector
 * style — no API key, no usage quota, used whenever Google isn't available.
 */
export function MapLibreFallback({
  lat,
  lng,
  label,
  className,
}: Readonly<{
  lat: number;
  lng: number;
  label: string;
  className?: string;
}>) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return null;
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    import("maplibre-gl").then(({ Map: MapLibreMap, Marker, NavigationControl, Popup }) => {
      if (cancelled || !containerRef.current) return null;
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

  return <div className={className} ref={containerRef} />;
}
