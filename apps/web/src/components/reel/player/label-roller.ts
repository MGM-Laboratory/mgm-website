import gsap from "gsap";

/**
 * A short uppercase word that rolls when it changes: the old letters roll
 * up and out one after another while the new ones roll in from below, and
 * the pill around them eases to the new word's width. Used beside the reel
 * player's cursor ("CLOSE", "PLAY", "SEEK" and so on).
 */
export class LabelRoller {
  private text = "";
  private line: HTMLSpanElement | null = null;
  private widthTween: gsap.core.Tween | null = null;

  constructor(
    private readonly pill: HTMLElement,
    private readonly padding = 20,
  ) {
    // A pill can outlive a roller (a remount): start from an empty one.
    pill.replaceChildren();
    pill.style.width = "0px";
  }

  get current() {
    return this.text;
  }

  set(text: string, animate: boolean) {
    if (text === this.text) return;
    this.text = text;
    const previous = this.line;
    if (!text) {
      // No word: keep the last one in the pill while it fades with the label.
      this.text = previous?.textContent ?? "";
      return;
    }
    const line = document.createElement("span");
    line.className = "absolute inset-0 flex items-center justify-center whitespace-pre";
    const letters: HTMLSpanElement[] = [];
    for (const char of text) {
      const letter = document.createElement("span");
      letter.className = "inline-block";
      letter.textContent = char;
      letters.push(letter);
      line.appendChild(letter);
    }
    this.pill.appendChild(line);
    this.line = line;

    // The word's natural width, measured off-flow so the pill can ease to it.
    line.style.position = "static";
    line.style.display = "inline-flex";
    const width = line.getBoundingClientRect().width + this.padding;
    line.style.position = "";
    line.style.display = "";

    this.widthTween?.kill();
    if (!animate || !previous) {
      previous?.remove();
      this.pill.style.width = `${width}px`;
      return;
    }
    this.widthTween = gsap.to(this.pill, {
      width,
      duration: 0.32,
      ease: "power3.out",
    });
    const old = Array.from(previous.children);
    gsap.killTweensOf(old);
    gsap.to(old, {
      yPercent: -120,
      opacity: 0,
      duration: 0.22,
      ease: "power2.in",
      stagger: 0.014,
      onComplete: () => previous.remove(),
    });
    gsap.fromTo(
      letters,
      { yPercent: 120, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.34, ease: "back.out(2)", stagger: 0.018, delay: 0.05 },
    );
  }

  destroy() {
    this.widthTween?.kill();
    gsap.killTweensOf(this.pill.querySelectorAll("span"));
    this.pill.replaceChildren();
    this.line = null;
    this.text = "";
  }
}
