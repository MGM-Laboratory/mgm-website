import { describe, expect, it } from "vitest";

import { ScanBudget } from "./scan-budget.js";

const done = async () => "done";

describe("ScanBudget", () => {
  it("runs the budget of a second and refuses the rest", async () => {
    const budget = new ScanBudget(3, 10, () => 10_000);
    const answers = [];
    for (let i = 0; i < 5; i += 1) answers.push(await budget.run(done));
    expect(answers).toEqual(["done", "done", "done", undefined, undefined]);
  });

  it("starts a new budget after a second", async () => {
    let now = 10_000;
    const budget = new ScanBudget(1, 10, () => now);
    expect(await budget.run(done)).toBe("done");
    expect(await budget.run(done)).toBeUndefined();
    now += 1000;
    expect(await budget.run(done)).toBe("done");
  });

  it("starts a new budget when the clock steps backwards", async () => {
    let now = 10_000;
    const budget = new ScanBudget(1, 10, () => now);
    expect(await budget.run(done)).toBe("done");
    now -= 60_000;
    expect(await budget.run(done)).toBe("done");
  });

  it("limits the calls that run at the same time and frees the slot afterwards", async () => {
    const budget = new ScanBudget(100, 2, () => 10_000);
    const release: Array<() => void> = [];
    const slow = () => new Promise<string>((resolve) => release.push(() => resolve("slow")));
    const first = budget.run(slow);
    const second = budget.run(slow);
    expect(await budget.run(done)).toBeUndefined();
    release.forEach((resolve) => resolve());
    expect(await Promise.all([first, second])).toEqual(["slow", "slow"]);
    expect(await budget.run(done)).toBe("done");
  });

  it("frees the slot when the call throws", async () => {
    const budget = new ScanBudget(100, 1, () => 10_000);
    await expect(
      budget.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await budget.run(done)).toBe("done");
  });
});
