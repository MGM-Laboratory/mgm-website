"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

const ReactQueryDevtools =
  process.env.NEXT_PUBLIC_SHOW_QUERY_DEVTOOLS === "true"
    ? dynamic(
        () => import("@tanstack/react-query-devtools").then((module) => module.ReactQueryDevtools),
        { ssr: false },
      )
    : null;

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      forcedTheme={pathname.startsWith("/admin") ? "light" : undefined}
    >
      <QueryClientProvider client={queryClient}>
        {children}
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
