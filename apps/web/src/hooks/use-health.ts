"use client";

import { useQuery } from "@tanstack/react-query";
import { healthResponseSchema } from "@repo/shared";

import { env } from "@/lib/env";

async function fetchHealth() {
  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/health`);
  if (!res.ok) {
    throw new Error(`API health check failed with status ${res.status}`);
  }
  return healthResponseSchema.parse(await res.json());
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false,
  });
}
