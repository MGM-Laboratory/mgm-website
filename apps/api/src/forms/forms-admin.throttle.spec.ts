import type { ExecutionContext } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { skipThrottleForFormsAdmin } from "./forms-admin.throttle.js";

function context(url: string, passphrase?: string, type = "http") {
  return {
    getType: () => type,
    switchToHttp: () => ({
      getRequest: () => ({
        originalUrl: url,
        headers: passphrase === undefined ? {} : { "x-cms-passphrase": passphrase },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe("skipThrottleForFormsAdmin", () => {
  const previous = process.env.ADMIN_PASSPHRASE;
  beforeEach(() => {
    process.env.ADMIN_PASSPHRASE = "correct horse";
  });
  afterEach(() => {
    process.env.ADMIN_PASSPHRASE = previous;
  });

  it("lets authenticated forms admin requests through", () => {
    expect(skipThrottleForFormsAdmin(context("/api/forms/admin", "correct horse"))).toBe(true);
    expect(
      skipThrottleForFormsAdmin(
        context("/api/forms/admin/abc/files/key?download=1", "correct horse"),
      ),
    ).toBe(true);
  });

  it("keeps throttling wrong or missing passphrases", () => {
    expect(skipThrottleForFormsAdmin(context("/api/forms/admin", "guess"))).toBe(false);
    expect(skipThrottleForFormsAdmin(context("/api/forms/admin"))).toBe(false);
  });

  it("never skips public form routes or other paths", () => {
    expect(
      skipThrottleForFormsAdmin(context("/api/forms/public/x/responses", "correct horse")),
    ).toBe(false);
    expect(skipThrottleForFormsAdmin(context("/api/forms/administrators", "correct horse"))).toBe(
      false,
    );
    expect(skipThrottleForFormsAdmin(context("/api/cms/events/admin", "correct horse"))).toBe(
      false,
    );
  });

  it("never skips without a configured passphrase or outside HTTP", () => {
    process.env.ADMIN_PASSPHRASE = "";
    expect(skipThrottleForFormsAdmin(context("/api/forms/admin", ""))).toBe(false);
    process.env.ADMIN_PASSPHRASE = "correct horse";
    expect(skipThrottleForFormsAdmin(context("/api/forms/admin", "correct horse", "rpc"))).toBe(
      false,
    );
  });
});
