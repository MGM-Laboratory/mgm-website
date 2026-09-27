"use client";

import { useEffect } from "react";

import { labNote } from "@/lib/lab-notes";
import { registerThemeSwitchHandler } from "@/lib/theme-switch";

/**
 * A small aside when the visitor flips the theme on the homepage. It hooks
 * the header toggle's switch request (lib/theme-switch.ts) and always hands
 * the switch back (returns false), so the toggle commits it as before. Only
 * a real press of the toggle says anything; the first theme a page loads
 * with never does.
 */
export function useThemeNotes() {
  useEffect(
    () =>
      registerThemeSwitchHandler((request) => {
        if (request.next === "dark") {
          labNote({
            id: "theme-dark",
            text: "Lights off. We work late too.",
            shape: "circle",
            tone: "blue",
          });
        } else {
          labNote({
            id: "theme-light",
            text: "Lights on. Let us get back to it.",
            shape: "circle",
            tone: "yellow",
          });
        }
        return false;
      }),
    [],
  );
}
