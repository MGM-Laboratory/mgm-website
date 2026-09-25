/**
 * Small magnetism for the article's links (categories, authors, source
 * chips, inline links): the one under a fine pointer drifts a few pixels
 * toward it and springs home when the pointer leaves, and an inline link's
 * underline grows out from where the pointer entered.
 *
 * Moves elements with the `translate` property only (nothing else animates
 * it on these elements), from one rAF that runs only while something is
 * still moving. Fine pointers with motion allowed only.
 */

const PULL_X = 0.16;
const PULL_Y = 0.22;
const MAX_X = 6;
const MAX_Y = 4;
const FOLLOW = 0.22;

type Magnet = { element: HTMLElement; x: number; y: number; tx: number; ty: number };

export class LinkMagnets {
  private readonly magnets = new Map<HTMLElement, Magnet>();
  private active: HTMLElement | null = null;
  private raf = 0;
  private last = 0;

  constructor(private readonly root: HTMLElement) {
    root.addEventListener("pointermove", this.onMove, { passive: true });
    root.addEventListener("pointerleave", this.onLeave);
  }

  dispose() {
    this.root.removeEventListener("pointermove", this.onMove);
    this.root.removeEventListener("pointerleave", this.onLeave);
    window.cancelAnimationFrame(this.raf);
    for (const magnet of this.magnets.values()) magnet.element.style.translate = "";
    this.magnets.clear();
  }

  private readonly onMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-ad-magnetic]")
        : null;
    if (target !== this.active) {
      if (this.active) this.release(this.active);
      this.active = target;
      if (target?.classList.contains("ad-link")) {
        // The underline grows out from where the pointer came in.
        const rect = target.getBoundingClientRect();
        const at = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100;
        target.style.setProperty("--ad-link-from", `${Math.min(100, Math.max(0, at)).toFixed(1)}%`);
      }
    }
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const magnet = this.magnetFor(target);
    magnet.tx = Math.max(-MAX_X, Math.min(MAX_X, dx * PULL_X));
    magnet.ty = Math.max(-MAX_Y, Math.min(MAX_Y, dy * PULL_Y));
    this.schedule();
  };

  private readonly onLeave = () => {
    if (this.active) this.release(this.active);
    this.active = null;
  };

  private release(element: HTMLElement) {
    const magnet = this.magnets.get(element);
    if (!magnet) return;
    magnet.tx = 0;
    magnet.ty = 0;
    this.schedule();
  }

  private magnetFor(element: HTMLElement) {
    let magnet = this.magnets.get(element);
    if (!magnet) {
      magnet = { element, x: 0, y: 0, tx: 0, ty: 0 };
      this.magnets.set(element, magnet);
    }
    return magnet;
  }

  private schedule() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = window.requestAnimationFrame(this.step);
  }

  private readonly step = (now: number) => {
    this.raf = 0;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const k = 1 - (1 - FOLLOW) ** (60 * dt);
    let moving = false;
    for (const magnet of this.magnets.values()) {
      magnet.x += (magnet.tx - magnet.x) * k;
      magnet.y += (magnet.ty - magnet.y) * k;
      const still = Math.abs(magnet.tx - magnet.x) < 0.05 && Math.abs(magnet.ty - magnet.y) < 0.05;
      if (still) {
        magnet.x = magnet.tx;
        magnet.y = magnet.ty;
      } else {
        moving = true;
      }
      magnet.element.style.translate =
        magnet.x === 0 && magnet.y === 0 ? "" : `${magnet.x.toFixed(2)}px ${magnet.y.toFixed(2)}px`;
    }
    if (moving) this.raf = window.requestAnimationFrame(this.step);
  };
}
