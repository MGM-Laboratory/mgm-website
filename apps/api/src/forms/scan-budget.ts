/**
 * A limit on an expensive call, in two ways. At most `perSecond` calls may
 * start in a second, and at most `maxConcurrent` may run at once. `run`
 * answers `undefined` without calling when either limit is spent. Each copy
 * of the API keeps its own count, which is enough to bound the load of one
 * copy.
 */
export class ScanBudget {
  private windowStart = 0;
  private used = 0;
  private active = 0;

  constructor(
    private readonly perSecond: number,
    private readonly maxConcurrent: number,
    private readonly now: () => number = Date.now,
  ) {}

  async run<T>(call: () => Promise<T>): Promise<T | undefined> {
    const now = this.now();
    // A clock that stepped backwards starts a new window as well.
    if (now < this.windowStart || now - this.windowStart >= 1000) {
      this.windowStart = now;
      this.used = 0;
    }
    if (this.used >= this.perSecond || this.active >= this.maxConcurrent) return undefined;
    this.used += 1;
    this.active += 1;
    try {
      return await call();
    } finally {
      this.active -= 1;
    }
  }
}
