import type { ContactSettings } from "@repo/shared";
import { describe, expect, it } from "vitest";

import { mergeOrdinarySave } from "./contact-settings-merge";

const current: ContactSettings = {
  emails: ["old@example.org"],
  address: "Old street",
  lat: 1,
  lng: 2,
  mailStrategy: "loadBalanceWeighted",
  mailProviderOrder: ["ses", "smtp", "resend"],
  mailProviderWeights: { ses: 3, smtp: 1 },
  mailProviderLimits: { ses: { windowMode: "rolling", dailyLimit: 50 } },
};

describe("mergeOrdinarySave", () => {
  it("keeps the stored routing when the body has no routing fields", () => {
    const result = mergeOrdinarySave(
      { emails: ["new@example.org"], address: "New street", lat: 3, lng: 4 },
      current,
    );
    expect(result).toEqual({
      ok: true,
      payload: {
        emails: ["new@example.org"],
        address: "New street",
        lat: 3,
        lng: 4,
        mailStrategy: current.mailStrategy,
        mailProviderOrder: current.mailProviderOrder,
        mailProviderWeights: current.mailProviderWeights,
        mailProviderLimits: current.mailProviderLimits,
      },
    });
  });

  it("accepts routing fields that equal the stored ones", () => {
    const result = mergeOrdinarySave({ ...current, address: "New street" }, current);
    expect(result.ok).toBe(true);
  });

  it("ignores the order of object properties but not the order of the provider list", () => {
    const sameWeights = mergeOrdinarySave(
      {
        mailProviderWeights: { smtp: 1, ses: 3 },
        mailProviderLimits: { ses: { dailyLimit: 50, windowMode: "rolling" } },
      },
      current,
    );
    expect(sameWeights.ok).toBe(true);
    const otherOrder = mergeOrdinarySave({ mailProviderOrder: ["smtp", "ses", "resend"] }, current);
    expect(otherOrder).toEqual({ ok: false });
  });

  it("refuses a body that changes any routing field", () => {
    expect(mergeOrdinarySave({ mailStrategy: "failover" }, current)).toEqual({ ok: false });
    expect(mergeOrdinarySave({ mailProviderWeights: { ses: 9 } }, current)).toEqual({ ok: false });
  });
});
