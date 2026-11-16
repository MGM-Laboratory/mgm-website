// Copyright (c) MGM Laboratory contributors
// SPDX-License-Identifier: GPL-3.0-only

import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { HealthController } from "./health.controller.js";

describe("HealthController", () => {
  it("answers ok with uptime and a timestamp when the database answers", async () => {
    const prisma = { $queryRaw: vi.fn(async () => [{ "?column?": 1 }]) };
    const result = await new HealthController(prisma as never).check();
    expect(result.status).toBe("ok");
    expect(result.uptime).toBeGreaterThan(0);
    expect(new Date(result.timestamp).toString()).not.toBe("Invalid Date");
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("answers 503 with an error body when the database fails", async () => {
    const prisma = { $queryRaw: vi.fn(async () => Promise.reject(new Error("db down"))) };
    const error = await new HealthController(prisma as never)
      .check()
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    const body = (error as ServiceUnavailableException).getResponse() as { status: string };
    expect(body.status).toBe("error");
    expect((error as ServiceUnavailableException).getStatus()).toBe(503);
  });
});
