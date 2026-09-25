/**
 * The story's scroll reveals. Each block marked `data-ad-reveal` appears as
 * it comes into view: paragraphs dissolve in along a diagonal, headings rise
 * word by word, pictures emerge through a clip while they settle, captions
 * and list rows follow (the motion itself is CSS, keyed on
 * `data-revealed`, in app/articles/detail.css).
 *
 * IntersectionObserver rather than ScrollTrigger: nothing here scrubs, and
 * an observer reports a block that is already past the viewport on its
 * first callback, so a block can never be left hidden above the reader
 * (docs/animation-system.md gotcha #11). Those, and anything already in
 * view when the reveals are enabled, show at once or play in order.
 *
 * Until `enable()` (the hero's entrance is under way), blocks that come
 * into view wait, so the lede never beats the title.
 */

const ROOT_MARGIN = "0px 0px -9% 0px";
/** After this long a revealed block drops its animation (and its masks and layers). */
const SETTLED_MS = 3200;
/** Blocks that come into view together play one after the other. */
const BATCH_STAGGER_MS = 110;

export class StoryReveals {
  private readonly observer: IntersectionObserver | null = null;
  private readonly pending = new Set<HTMLElement>();
  private enabled = false;
  private queue: HTMLElement[] = [];
  private flushTimer = 0;
  private readonly timers = new Set<number>();
  private disposed = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly animate: boolean,
  ) {
    const blocks = [...root.querySelectorAll<HTMLElement>("[data-ad-reveal]")];
    if (!animate || typeof IntersectionObserver === "undefined") {
      for (const block of blocks) block.dataset.revealed = "instant";
      return;
    }
    this.observer = new IntersectionObserver(this.onIntersect, { rootMargin: ROOT_MARGIN });
    for (const block of blocks) {
      this.pending.add(block);
      this.observer.observe(block);
    }
  }

  /** Lets waiting blocks play (the hero entrance has got far enough). */
  enable() {
    if (this.enabled || this.disposed) return;
    this.enabled = true;
    this.scheduleFlush();
  }

  /** Shows everything at once (reduced motion switched on mid-visit). */
  showAll() {
    for (const block of this.pending) block.dataset.revealed = "instant";
    this.pending.clear();
    this.queue = [];
    this.observer?.disconnect();
  }

  dispose() {
    this.disposed = true;
    this.observer?.disconnect();
    window.clearTimeout(this.flushTimer);
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
  }

  private readonly onIntersect = (entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      const block = entry.target as HTMLElement;
      if (!this.pending.has(block)) continue;
      if (entry.isIntersecting) {
        this.queue.push(block);
      } else if (entry.boundingClientRect.bottom <= 0) {
        // Already above the reader (a reload further down, a return to the
        // page): no animation for what nobody will watch arrive.
        this.reveal(block, true);
      }
    }
    this.scheduleFlush();
  };

  private scheduleFlush() {
    if (!this.enabled || !this.queue.length || this.flushTimer) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = 0;
      this.flush();
    }, 0);
  }

  private flush() {
    if (this.disposed) return;
    // In document order, one after another.
    const batch = this.queue
      .splice(0)
      .filter((block) => this.pending.has(block))
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    batch.forEach((block, index) => {
      if (index === 0) {
        this.reveal(block, false);
        return;
      }
      this.pending.delete(block);
      const timer = window.setTimeout(() => {
        this.timers.delete(timer);
        this.pending.add(block);
        this.reveal(block, false);
      }, index * BATCH_STAGGER_MS);
      this.timers.add(timer);
    });
  }

  private reveal(block: HTMLElement, instant: boolean) {
    if (this.disposed || !this.pending.has(block)) return;
    this.pending.delete(block);
    this.observer?.unobserve(block);
    block.dataset.revealed = instant ? "instant" : "";
    if (instant) return;
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      block.dataset.revealed = "done";
    }, SETTLED_MS);
    this.timers.add(timer);
  }
}
