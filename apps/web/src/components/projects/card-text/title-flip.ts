import gsap from "gsap";

/**
 * The title hover flip: magicui's text-3d-flip. Every character's first
 * copy is a 3D box whose front face sits in the text plane and whose back
 * face is pre-rotated -90deg on X; the flip rotates each box 90deg forward
 * in a staggered wave, which rolls the back face (the same glyph) up into
 * view. The geometry mirrors magicui's CharBox exactly: the box hangs half
 * a line behind its plane and each face sits half a line in front of the
 * box (translateZ offsets of ±0.5lh, no perspective); only the spring is
 * approximated with a power2 ease.
 *
 * That geometry exists only while a flip runs. At rest each character is
 * plain flat text: Chromium gives every preserve-3d box and translateZ /
 * backface-hidden face its own compositor layer, and fifteen titles kept
 * about a thousand of them alive, re-layerized on every animated frame of
 * the page. The front face at +0.5lh and the box at -0.5lh cancel out with
 * no perspective, so the flat rest state renders identically.
 *
 * `data-flipping` on the title row switches on the faces' CSS geometry
 * (the markup keys it with `in-data-flipping:`); the box's own transform
 * (the z offset and the rotation) is GSAP's alone.
 */
export type TitleFlip = {
  /** Plays one flip on `row`'s characters, unless one is already rolling. */
  play(row: HTMLElement): void;
  /** Stops any flip and returns the characters to flat rest text. */
  stop(): void;
};

export function createTitleFlip(): TitleFlip {
  let timeline: gsap.core.Timeline | null = null;
  let flipRow: HTMLElement | null = null;

  const chars = (row: HTMLElement) => gsap.utils.toArray<HTMLElement>(".project-card-char", row);

  // Every exit (the wave finishing, the card resetting out of view, the
  // hover wiring being torn down) ends here: timeline.kill() never fires
  // onComplete, so each caller must be able to run the teardown itself.
  const stop = () => {
    timeline?.kill();
    timeline = null;
    const row = flipRow;
    flipRow = null;
    if (!row) return;
    gsap.set(chars(row), { clearProps: "transform" });
    delete row.dataset.flipping;
  };

  return {
    play(row) {
      if (timeline) return;
      flipRow = row;
      const boxes = chars(row);
      row.dataset.flipping = "";
      gsap.set(boxes, { z: -0.5 * parseFloat(getComputedStyle(row).lineHeight) });
      // The rotationX tween keeps the z offset set above. At 90deg every
      // box shows its back face, which reads the same as the front, so the
      // teardown's return to flat text is invisible.
      timeline = gsap
        .timeline({ onComplete: stop })
        .to(boxes, { rotationX: 90, duration: 0.5, stagger: 0.05, ease: "power2.out" });
    },
    stop,
  };
}
