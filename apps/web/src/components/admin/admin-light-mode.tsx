"use client";

import { useLayoutEffect } from "react";

export function AdminLightMode({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    const previousColorScheme = root.style.colorScheme;
    const enforceLight = () => {
      if (root.classList.contains("dark")) root.classList.remove("dark");
      root.style.colorScheme = "light";
    };

    enforceLight();
    const observer = new MutationObserver(enforceLight);
    observer.observe(root, { attributeFilter: ["class"], attributes: true });

    return () => {
      observer.disconnect();
      root.style.colorScheme = previousColorScheme;
      root.classList.toggle("dark", wasDark);
    };
  }, []);

  return children;
}
