"use client";

import { useLayoutEffect } from "react";

export function AdminLightMode({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    const previousColorScheme = root.style.colorScheme;

    root.classList.remove("dark");
    root.style.colorScheme = "light";

    return () => {
      root.style.colorScheme = previousColorScheme;
      root.classList.toggle("dark", wasDark);
    };
  }, []);

  return children;
}
