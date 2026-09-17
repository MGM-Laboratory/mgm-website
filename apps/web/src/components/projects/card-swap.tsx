"use client";

import {
  Children,
  cloneElement,
  createRef,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import gsap from "gsap";

import { cn } from "@/lib/utils";
import styles from "./card-swap.module.css";

/**
 * Ported from React Bits' CardSwap (https://reactbits.dev) — a stack of
 * cards that auto-cycles, the front card dropping away and returning to the
 * back while the rest promote forward. The stacking/animation mechanics are
 * unchanged from the original; the styling was reworked onto this site's
 * design tokens and the auto-cycle loop is skipped under reduced motion
 * (see docs/animation-system.md) since it's a decorative idle loop, not
 * something that gates reaching the content — every card is still a normal
 * link, reachable and clickable without the animation ever running.
 */

export type CardSwapCardProps = Readonly<
  { customClass?: string; ref?: Ref<HTMLDivElement> } & React.ComponentPropsWithoutRef<"div">
>;

export function Card({ customClass, className, ref, ...rest }: CardSwapCardProps) {
  return <div ref={ref} className={cn(styles.card, customClass, className)} {...rest} />;
}

type Slot = { x: number; y: number; z: number; zIndex: number };

function makeSlot(i: number, distX: number, distY: number, total: number): Slot {
  return { x: i * distX, y: -i * distY, z: -i * distX * 1.5, zIndex: total - i };
}

function placeNow(el: HTMLElement, slot: Slot, skew: number) {
  gsap.set(el, {
    x: slot.x,
    y: slot.y,
    z: slot.z,
    xPercent: -50,
    yPercent: -50,
    skewY: skew,
    transformOrigin: "center center",
    zIndex: slot.zIndex,
    force3D: true,
  });
}

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

export type CardSwapProps = Readonly<{
  width?: number | string;
  height?: number | string;
  cardDistance?: number;
  verticalDistance?: number;
  delay?: number;
  pauseOnHover?: boolean;
  skewAmount?: number;
  easing?: "linear" | "elastic";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}>;

export function CardSwap({
  width = 500,
  height = 400,
  cardDistance = 60,
  verticalDistance = 70,
  delay = 5000,
  pauseOnHover = false,
  skewAmount = 6,
  easing = "elastic",
  className,
  style,
  children,
}: CardSwapProps) {
  const config = useMemo(
    () =>
      easing === "elastic"
        ? {
            ease: "elastic.out(0.6,0.9)",
            durDrop: 2,
            durMove: 2,
            durReturn: 2,
            promoteOverlap: 0.9,
            returnDelay: 0.05,
          }
        : {
            ease: "power1.inOut",
            durDrop: 0.8,
            durMove: 0.8,
            durReturn: 0.8,
            promoteOverlap: 0.45,
            returnDelay: 0.2,
          },
    [easing],
  );

  const childArray = useMemo(
    () => Children.toArray(children).filter(isValidElement) as ReactElement<CardSwapCardProps>[],
    [children],
  );
  // A stable ref object per card (created once per card count, not a fresh
  // callback closure on every render) — cloneElement below just passes each
  // one through as a plain prop, which the ref-during-render lint rule
  // can't mistake for reading a ref's value while rendering.
  const cardRefs = useMemo(
    () => childArray.map(() => createRef<HTMLDivElement>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [childArray.length],
  );
  const order = useRef<number[]>(childArray.map((_, i) => i));
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = reducedMotion();
    const total = childArray.length;
    const els = cardRefs.map((ref) => ref.current);
    if (els.some((el) => !el)) return;

    order.current = childArray.map((_, i) => i);
    els.forEach((el, i) =>
      placeNow(el as HTMLElement, makeSlot(i, cardDistance, verticalDistance, total), skewAmount),
    );

    // The auto-cycle is a perpetual decorative loop — every card is a plain
    // link underneath, so skipping it under reduced motion loses nothing
    // reachable, only the idle motion.
    if (reduced || total < 2) return;

    let intervalId: ReturnType<typeof setInterval>;
    let currentTl: gsap.core.Timeline | null = null;

    const swap = () => {
      if (order.current.length < 2) return;
      const [front, ...rest] = order.current;
      const elFront = cardRefs[front]?.current;
      if (!elFront) return;
      const tl = gsap.timeline();
      currentTl = tl;

      tl.to(elFront, { y: "+=500", duration: config.durDrop, ease: config.ease });
      tl.addLabel("promote", `-=${config.durDrop * config.promoteOverlap}`);
      rest.forEach((idx, i) => {
        const el = cardRefs[idx]?.current;
        if (!el) return;
        const slot = makeSlot(i, cardDistance, verticalDistance, total);
        tl.set(el, { zIndex: slot.zIndex }, "promote");
        tl.to(
          el,
          { x: slot.x, y: slot.y, z: slot.z, duration: config.durMove, ease: config.ease },
          `promote+=${i * 0.15}`,
        );
      });

      const backSlot = makeSlot(total - 1, cardDistance, verticalDistance, total);
      tl.addLabel("return", `promote+=${config.durMove * config.returnDelay}`);
      tl.call(() => gsap.set(elFront, { zIndex: backSlot.zIndex }), undefined, "return");
      tl.to(
        elFront,
        {
          x: backSlot.x,
          y: backSlot.y,
          z: backSlot.z,
          duration: config.durReturn,
          ease: config.ease,
        },
        "return",
      );
      tl.call(() => {
        order.current = [...rest, front];
      });
    };

    intervalId = setInterval(swap, delay);

    const node = container.current;
    const pause = () => {
      currentTl?.pause();
      clearInterval(intervalId);
    };
    const resume = () => {
      currentTl?.play();
      intervalId = setInterval(swap, delay);
    };
    if (pauseOnHover && node) {
      node.addEventListener("mouseenter", pause);
      node.addEventListener("mouseleave", resume);
    }
    return () => {
      clearInterval(intervalId);
      currentTl?.kill();
      if (pauseOnHover && node) {
        node.removeEventListener("mouseenter", pause);
        node.removeEventListener("mouseleave", resume);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    childArray.length,
    cardRefs,
    cardDistance,
    verticalDistance,
    delay,
    pauseOnHover,
    skewAmount,
    config,
  ]);

  const rendered = childArray.map((child, i) =>
    cloneElement(child, {
      key: i,
      ref: cardRefs[i],
      style: { width, height, ...(child.props.style ?? {}) },
    }),
  );

  return (
    <div className={cn(styles.container, className)} ref={container} style={style}>
      {rendered}
    </div>
  );
}
