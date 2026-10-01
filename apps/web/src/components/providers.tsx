"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "sonner";

import { useThemeLock } from "@/lib/theme-lock";

const ReactQueryDevtools =
  process.env.NEXT_PUBLIC_SHOW_QUERY_DEVTOOLS === "true"
    ? dynamic(
        () => import("@tanstack/react-query-devtools").then((module) => module.ReactQueryDevtools),
        { ssr: false },
      )
    : null;

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // A page holding the theme lock (the homepage story) keeps the scheme it
  // started in, even if the OS switches mid-scene (lib/theme-lock.ts).
  const lock = useThemeLock();
  const forcedTheme = pathname.startsWith("/admin")
    ? "light"
    : lock.locked && lock.theme
      ? lock.theme
      : undefined;
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem forcedTheme={forcedTheme}>
      <QueryClientProvider client={queryClient}>
        <NuqsAdapter>{children}</NuqsAdapter>
        <Toaster
          closeButton
          duration={4500}
          expand
          gap={12}
          position="bottom-right"
          richColors
          theme={pathname.startsWith("/admin") ? "light" : "system"}
        />
        {ReactQueryDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
