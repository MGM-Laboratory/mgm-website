"use client";

import gsap from "gsap";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef } from "react";

import type { DetailLink } from "@/components/projects/detail/detail-data";
import { motionAllowed } from "@/lib/reduced-motion";

import styles from "./project-detail.module.css";

// The magnet: the pill leans a quarter of the way toward the cursor, at
// most this far, and springs back when the cursor leaves.
const MAGNET_SHARE = 0.22;
const MAGNET_MAX_PX = 9;

/**
 * lusion's CTA anatomy (a dot, an uppercase label, an arrow chip hidden at
 * scale 0), in the project's button colours. Hover floods the pill from the
 * dot (CSS, hover-capable pointers only); focus shows the same state plus a
 * ring. Added here: a gentle magnetic pull toward the cursor, and a press
 * that squeezes the pill and sends a pulse out of it.
 */
export function DetailCta({ cta }: { cta: DetailLink }) {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const link = ref.current;
    if (!link) return;
    // GSAP owns this element's transform; nothing in the stylesheet sets one.
    const toX = gsap.quickTo(link, "x", { duration: 0.6, ease: "power3.out" });
    const toY = gsap.quickTo(link, "y", { duration: 0.6, ease: "power3.out" });

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !motionAllowed()) return;
      const rect = link.getBoundingClientRect();
      const x = event.clientX - (rect.left + rect.width / 2);
      const y = event.clientY - (rect.top + rect.height / 2);
      toX(gsap.utils.clamp(-MAGNET_MAX_PX, MAGNET_MAX_PX, x * MAGNET_SHARE));
      toY(gsap.utils.clamp(-MAGNET_MAX_PX, MAGNET_MAX_PX, y * MAGNET_SHARE));
    };
    const onLeave = () => {
      gsap.to(link, { x: 0, y: 0, duration: 0.8, ease: "elastic.out(1, 0.45)", overwrite: true });
    };
    const onDown = () => {
      link.removeAttribute("data-pulse");
      // Restart the pulse animation on every press.
      void link.offsetWidth;
      link.setAttribute("data-pulse", "");
    };
    const onPulseEnd = () => link.removeAttribute("data-pulse");

    link.addEventListener("pointermove", onMove);
    link.addEventListener("pointerleave", onLeave);
    link.addEventListener("pointerdown", onDown);
    link.addEventListener("animationend", onPulseEnd);
    return () => {
      link.removeEventListener("pointermove", onMove);
      link.removeEventListener("pointerleave", onLeave);
      link.removeEventListener("pointerdown", onDown);
      link.removeEventListener("animationend", onPulseEnd);
      gsap.killTweensOf(link);
    };
  }, []);

  return (
    <a
      className={styles.cta}
      href={cta.href}
      ref={ref}
      rel={cta.external ? "noopener noreferrer" : undefined}
      target={cta.external ? "_blank" : undefined}
    >
      <span aria-hidden="true" className={styles.ctaPulse} />
      <span className={styles.ctaPill}>
        <span aria-hidden="true" className={styles.ctaDot} />
        <span className={styles.ctaLabel}>
          {cta.label}
          {cta.external ? <span className={styles.srOnly}> (opens in a new tab)</span> : null}
        </span>
        <span aria-hidden="true" className={styles.ctaArrow}>
          <ArrowUpRight strokeWidth={2.25} />
        </span>
      </span>
    </a>
  );
}
