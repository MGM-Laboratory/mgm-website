import { describe, expect, it } from "vitest";

import { ScanBudget } from "./scan-budget.js";

describe("ScanBudget", () => {
  it("allows the budget of a second and refuses the rest", () => {
    const budget = new ScanBudget(3, () => 10_000);
    expect([1, 2, 3, 4, 5].map(() => budget.take())).toEqual([true, true, true, false, false]);
  });

  it("starts a new budget after a second", () => {
    let now = 10_000;
    const budget = new ScanBudget(1, () => now);
    expect(budget.take()).toBe(true);
    expect(budget.take()).toBe(false);
    now += 1000;
    expect(budget.take()).toBe(true);
  });
});
