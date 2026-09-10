import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // `prisma generate` (e.g. in a Docker build) doesn't need a real, reachable
    // DATABASE_URL — only `migrate`/`studio`/the runtime client do. Reading
    // straight from process.env (instead of prisma/config's `env()`, which
    // errors eagerly on a missing var) keeps `generate` working without it.
    url:
      process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
