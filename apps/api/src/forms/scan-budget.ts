/**
 * A budget of expensive calls for each second. `take` answers true while the
 * budget of the current second lasts and false after that. Each copy of the
 * API keeps its own count, which is enough to bound the load of one copy.
 */
export class ScanBudget {
  private windowStart = 0;
  private used = 0;

  constructor(
    private readonly perSecond: number,
    private readonly now: () => number = Date.now,
  ) {}

  take(): boolean {
    const now = this.now();
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      this.used = 0;
    }
    this.used += 1;
    return this.used <= this.perSecond;
  }
}
