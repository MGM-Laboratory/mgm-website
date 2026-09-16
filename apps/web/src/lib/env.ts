import { z } from "zod";

const envSchema = z.object({
  // An empty string (e.g. an unset build-arg in CI) should fall back to the
  // default too, not just `undefined` — `.default()` alone only covers the latter.
  NEXT_PUBLIC_API_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().default("http://localhost:4000/api"),
  ),
  // Optional: without it, the event detail page falls back to a static
  // address + "Open in Google Maps" link instead of an interactive map.
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().optional(),
  ),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
});
