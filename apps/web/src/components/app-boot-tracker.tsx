"use client";

import { useEffect } from "react";

import { markAppBooted } from "@/lib/app-boot";

/**
 * Mounted once at the root layout, persisting across every client-side
 * navigation — marks the app as booted so hero.tsx (mounted only on `/`,
 * so it unmounts and remounts on every visit to the homepage) can tell a
 * fresh visit or reload from the user navigating back here internally.
 */
export function AppBootTracker() {
  useEffect(() => {
    markAppBooted();
  }, []);
  return null;
}
