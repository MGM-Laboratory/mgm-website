import gsap from "gsap";

import type { Stage } from "./stage";

/**
 * The "Scroll" cue under the hero: a gentle bob while it waits, and on
 * hover (or keyboard focus) the arrow drops and the word rolls over. The
 * button itself keeps its reveal tween and its CSS centring translate;
 * only its inner parts move here.
 */
export function startScrollCue(stage: Stage) {
  const button = stage.root.querySelector<HTMLElement>(".scroll-indicator");
  const content = button?.querySelector<HTMLElement>("[data-part='content']");
  const arrow = button?.querySelector<SVGElement>(".scroll-cue-arrow");
  const roll = button?.querySelector<HTMLElement>(".scroll-cue-roll");
  if (!button || !content || !arrow || !roll) return () => {};

  const bob = gsap.to(content, {
    y: -4,
    duration: 1.4,
    ease: "sine.inOut",
    yoyo: true,
    repeat: -1,
    paused: !stage.active(),
  });
  const offActive = stage.onActiveChange((active) => bob.paused(!active));

  let over = false;
  const set = (on: boolean) => {
    if (on === over) return;
    over = on;
    gsap.to(arrow, {
      y: on ? 6 : 0,
      duration: on ? 0.4 : 0.6,
      ease: on ? "back.out(3)" : "elastic.out(1, 0.45)",
      overwrite: "auto",
    });
    gsap.to(roll, {
      yPercent: on ? -50 : 0,
      duration: 0.45,
      ease: "power3.inOut",
      overwrite: "auto",
    });
  };
  const onEnter = (event: PointerEvent) => {
    if (event.pointerType !== "touch") set(true);
  };
  const onLeave = () => set(button.matches(":focus-visible"));
  // Keyboard focus only: a mouse click focuses the button as well.
  const onFocus = () => {
    if (button.matches(":focus-visible")) set(true);
  };
  const onBlur = () => set(false);
  button.addEventListener("pointerenter", onEnter);
  button.addEventListener("pointerleave", onLeave);
  button.addEventListener("focus", onFocus);
  button.addEventListener("blur", onBlur);

  return () => {
    offActive();
    button.removeEventListener("pointerenter", onEnter);
    button.removeEventListener("pointerleave", onLeave);
    button.removeEventListener("focus", onFocus);
    button.removeEventListener("blur", onBlur);
    bob.kill();
    gsap.killTweensOf([arrow, roll]);
    gsap.set([content, arrow, roll], { clearProps: "transform" });
  };
}
