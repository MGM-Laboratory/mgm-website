"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ChevronDown, ArrowUpRight } from "lucide-react";

import { CONTACT_EMAIL, LEGAL_LINKS, NAV_ITEMS, NAV_SOCIALS } from "@/data/nav";
import { toneColor } from "@/components/process/pattern-tile";
import {
  DiscordGlyph,
  InstagramGlyph,
  LinkedinGlyph,
  type GlyphProps,
} from "@/components/social-icons";
import { LogoMark as ShardLogo } from "@/components/hero/shapes";
import { EmailReveal } from "./email-reveal";
import { FocusBento } from "./focus-bento";
import { WorkBento } from "./work-bento";

const SOCIAL_ICONS: Record<string, ComponentType<GlyphProps>> = {
  Instagram: InstagramGlyph,
  LinkedIn: LinkedinGlyph,
  Discord: DiscordGlyph,
};

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

const wibTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Jakarta",
});

// Always Malang/WIB time regardless of the visitor's own timezone — the
// server has no notion of "now" for a client clock, so this renders a
// placeholder until the effect below fires on mount (avoids a hydration
// mismatch), same pattern as ThemeToggle's `useMounted`.
function useWIBClock() {
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setTime(wibTimeFormatter.format(new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

// Slides in staggered behind the panel itself — brand colors flashing past
// in sequence before the solid panel catches up, the same beat as the
// panel's own reveal in the kaizin.framer.website menu this is modeled on.
const LAYER_COLORS = [
  "var(--brand-red)",
  "var(--brand-yellow)",
  "var(--brand-blue)",
  "var(--brand-green)",
];

// Cycled across the social icons' CSS hover/focus states, matching the
// panel's brand palette without letting an inline animation color outlive a
// theme change.
const SOCIAL_ACCENTS = [
  toneColor("blue"),
  toneColor("red"),
  toneColor("yellow"),
  toneColor("green"),
  toneColor("blue"),
];

function measureHeight(el: HTMLElement) {
  const prevHeight = el.style.height;
  const prevVisibility = el.style.visibility;
  el.style.visibility = "hidden";
  el.style.height = "auto";
  const h = el.scrollHeight;
  el.style.height = prevHeight;
  el.style.visibility = prevVisibility;
  return h;
}

export function NavMenu() {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const pathname = usePathname();
  const isFirstRender = useRef(true);
  const wibTime = useWIBClock();

  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);

  const toggleRef = useRef<HTMLButtonElement>(null);
  const iconTopRef = useRef<HTMLSpanElement>(null);
  const iconBottomRef = useRef<HTMLSpanElement>(null);
  const textInnerRef = useRef<HTMLSpanElement>(null);

  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const fillRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const numberRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const arrowRefs = useRef<(SVGSVGElement | null)[]>([]);
  const chevronRefs = useRef<(SVGSVGElement | null)[]>([]);
  const clipRefs = useRef<(HTMLDivElement | null)[]>([]);
  const subRefs = useRef<(HTMLAnchorElement | null)[][]>([]);
  const firstLinkRef = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);

  const hoverTimelines = useRef<(gsap.core.Timeline | null)[]>([]);
  const socialRefs = useRef<(SVGSVGElement | null)[]>([]);
  const socialTimelines = useRef<(gsap.core.Timeline | null)[]>([]);
  const accordionTlRef = useRef<gsap.core.Timeline | null>(null);
  const openTlRef = useRef<gsap.core.Timeline | null>(null);
  const closeTlRef = useRef<gsap.core.Timeline | null>(null);
  const logoTlRef = useRef<gsap.core.Timeline | null>(null);
  const expandedRef = useRef<number | null>(null);

  // The panel/layers render `invisible` by default (see the comment above
  // the overlay) so there's nothing to see before this runs. From here,
  // GSAP owns their position and visibility exclusively: the panel and
  // layers become visible (autoAlpha: 1) but pushed off-screen (xPercent),
  // instead of visible-and-off-screen coming from a CSS transform class —
  // GSAP appears to preserve and stack onto whatever transform a class
  // already put on an element rather than replacing it, which previously
  // left the panel translated twice as far as intended the moment this ran.
  useLayoutEffect(() => {
    const layers = layerRefs.current.filter((el): el is HTMLDivElement => !!el);
    if (overlayRef.current) gsap.set(overlayRef.current, { autoAlpha: 0 });
    if (panelRef.current) gsap.set(panelRef.current, { autoAlpha: 1, xPercent: 100 });
    if (layers.length) gsap.set(layers, { autoAlpha: 1, xPercent: 100 });
    if (iconTopRef.current) gsap.set(iconTopRef.current, { y: -3, rotate: 0, width: 16 });
    if (iconBottomRef.current) gsap.set(iconBottomRef.current, { y: 3, rotate: 0, width: 10 });
  }, []);

  // One paused hover timeline per top-level item — lift the fill, move the
  // label, pop the number, slide the arrow in. Color belongs to CSS below,
  // rather than GSAP: GSAP's inline color values can outlive a theme switch
  // and override the current --foreground token.
  useLayoutEffect(() => {
    const reduced = reducedMotion();
    NAV_ITEMS.forEach((item, i) => {
      const fill = fillRefs.current[i];
      const label = labelRefs.current[i];
      const number = numberRefs.current[i];
      if (!fill || !label) return;
      const d = reduced ? 0 : 1;
      const tl = gsap.timeline({ paused: true, defaults: { overwrite: "auto" } });
      tl.to(fill, { scaleX: 1, duration: 0.4 * d, ease: "power3.out" }, 0).to(
        label,
        { x: 14, duration: 0.3 * d, ease: "power2.out" },
        0,
      );
      if (number) {
        tl.to(number, { scale: 1.15, duration: 0.3 * d, ease: "back.out(2)" }, 0);
      }
      const arrow = arrowRefs.current[i];
      if (arrow) {
        tl.fromTo(
          arrow,
          { opacity: 0, x: -8 },
          { opacity: 1, x: 14, duration: 0.3 * d, ease: "power2.out" },
          0.05,
        );
      }
      const chevron = chevronRefs.current[i];
      if (chevron) {
        tl.to(chevron, { x: 14, duration: 0.3 * d, ease: "power2.out" }, 0);
      }
      hoverTimelines.current[i] = tl;
    });
    return () => {
      hoverTimelines.current.forEach((tl) => tl?.kill());
      hoverTimelines.current = [];
    };
  }, []);

  // A little wiggle-and-pop per social icon on hover/focus — purely
  // decorative (the link itself is already fully reachable without it), so
  // playback is skipped outright under reduced motion (see socialHoverIn)
  // rather than collapsed to zero duration.
  useLayoutEffect(() => {
    NAV_SOCIALS.forEach((_, i) => {
      const icon = socialRefs.current[i];
      if (!icon) return;
      const tl = gsap.timeline({ paused: true, defaults: { overwrite: "auto" } });
      tl.to(icon, { rotate: -14, duration: 0.1, ease: "power1.out" })
        .to(icon, { rotate: 14, scale: 1.25, duration: 0.18, ease: "power1.inOut" }, ">")
        .to(icon, { rotate: 0, duration: 0.22, ease: "back.out(3)" }, ">");
      socialTimelines.current[i] = tl;
    });
    return () => {
      socialTimelines.current.forEach((tl) => tl?.kill());
      socialTimelines.current = [];
    };
  }, []);

  function socialHoverIn(i: number) {
    if (reducedMotion()) return;
    socialTimelines.current[i]?.play();
  }
  function socialHoverOut(i: number) {
    socialTimelines.current[i]?.reverse();
  }

  const lockScroll = useCallback((locked: boolean) => {
    ScrollSmoother.get()?.paused(locked);
    document.documentElement.style.overflow = locked ? "hidden" : "";
  }, []);

  const resetAccordions = useCallback(() => {
    accordionTlRef.current?.kill();
    accordionTlRef.current = null;
    NAV_ITEMS.forEach((item, i) => {
      if (item.kind !== "dropdown") return;
      const clip = clipRefs.current[i];
      const chevron = chevronRefs.current[i];
      const children = subRefs.current[i]?.filter((el): el is HTMLAnchorElement => !!el) ?? [];
      if (clip) gsap.set(clip, { height: 0 });
      if (chevron) gsap.set(chevron, { rotate: 0 });
      if (children.length) gsap.set(children, { opacity: 0, y: -8 });
    });
    expandedRef.current = null;
    setExpandedIndex(null);
  }, []);

  const buildOpenTimeline = useCallback(() => {
    const panel = panelRef.current;
    const overlay = overlayRef.current;
    if (!panel || !overlay) return null;

    openTlRef.current?.kill();
    closeTlRef.current?.kill();

    const layers = layerRefs.current.filter((el): el is HTMLDivElement => !!el);
    const items = itemRefs.current.filter((el): el is HTMLDivElement => !!el);

    gsap.set(layers, { xPercent: 100 });
    gsap.set(panel, { xPercent: 100 });
    gsap.set(items, { autoAlpha: 0, yPercent: 120, rotate: 8 });

    const tl = gsap.timeline({ paused: true });
    tl.to(overlay, { autoAlpha: 1, duration: 0.4, ease: "power2.out" }, 0);
    layers.forEach((el, i) => {
      tl.to(el, { xPercent: 0, duration: 0.5, ease: "power4.out" }, i * 0.07);
    });
    const lastLayerAt = layers.length ? (layers.length - 1) * 0.07 : 0;
    const panelAt = lastLayerAt + (layers.length ? 0.08 : 0);
    tl.to(panel, { xPercent: 0, duration: 0.65, ease: "power4.out" }, panelAt);

    const itemsAt = panelAt + 0.65 * 0.15;
    tl.to(
      items,
      { autoAlpha: 1, yPercent: 0, rotate: 0, duration: 0.9, ease: "power4.out", stagger: 0.07 },
      itemsAt,
    );

    openTlRef.current = tl;
    return tl;
  }, []);

  const playOpen = useCallback(() => {
    const tl = buildOpenTimeline();
    if (!tl) return;
    tl.play(0);
    requestAnimationFrame(() => firstLinkRef.current?.focus());
  }, [buildOpenTimeline]);

  const playClose = useCallback(() => {
    openTlRef.current?.kill();
    openTlRef.current = null;
    closeTlRef.current?.kill();

    const panel = panelRef.current;
    const overlay = overlayRef.current;
    if (!panel || !overlay) return;
    const layers = layerRefs.current.filter((el): el is HTMLDivElement => !!el);

    const tl = gsap.timeline({
      onComplete: () => {
        resetAccordions();
      },
    });
    tl.to([...layers, panel], { xPercent: 100, duration: 0.32, ease: "power3.in" }, 0).to(
      overlay,
      { autoAlpha: 0, duration: 0.28, ease: "power2.in" },
      0,
    );
    closeTlRef.current = tl;
  }, [resetAccordions]);

  // The empty left side (over the blurred/dimmed backdrop) gets the same
  // brand-mark assembly the hero plays after "& Mobile Laboratory" — three
  // shards flying in from different directions and popping into place —
  // reusing that exact component and choreography for continuity. Unlike
  // the hero, there's no settle bump after the shards land (just the
  // assembly, nothing extra once it's together) and closing is simpler
  // still, just a fade rather than reversing the assembly.
  const playLogoIn = useCallback(() => {
    logoTlRef.current?.kill();
    const d = reducedMotion() ? 0 : 1;
    const tl = gsap.timeline({ delay: 0.3 * d });
    tl.set(".nav-logo", { opacity: 1 })
      .fromTo(
        ".nav-logo [data-part='shard-1']",
        { opacity: 0, scale: 0.3, x: -40, y: -55, rotate: -140 },
        { opacity: 1, scale: 1, x: 0, y: 0, rotate: 0, duration: 0.55 * d, ease: "back.out(1.9)" },
      )
      .fromTo(
        ".nav-logo [data-part='shard-2']",
        { opacity: 0, scale: 0.3, x: -55, y: 45, rotate: 120 },
        { opacity: 1, scale: 1, x: 0, y: 0, rotate: 0, duration: 0.55 * d, ease: "back.out(1.9)" },
        "-=0.4",
      )
      .fromTo(
        ".nav-logo [data-part='shard-3']",
        { opacity: 0, scale: 0.3, x: 55, y: 45, rotate: -120 },
        { opacity: 1, scale: 1, x: 0, y: 0, rotate: 0, duration: 0.55 * d, ease: "back.out(1.9)" },
        "-=0.4",
      );
    logoTlRef.current = tl;
  }, []);

  const playLogoOut = useCallback(() => {
    logoTlRef.current?.kill();
    gsap.to(".nav-logo", { opacity: 0, duration: 0.3, ease: "power2.in" });
  }, []);

  const animateIcon = useCallback((opening: boolean) => {
    const top = iconTopRef.current;
    const bottom = iconBottomRef.current;
    if (!top || !bottom) return;
    gsap.killTweensOf([top, bottom]);
    if (opening) {
      gsap.to(top, { width: 16, y: 0, rotate: 45, duration: 0.4, ease: "power3.out" });
      gsap.to(bottom, { width: 16, y: 0, rotate: -45, duration: 0.4, ease: "power3.out" });
    } else {
      gsap.to(top, { width: 16, y: -3, rotate: 0, duration: 0.3, ease: "power3.inOut" });
      gsap.to(bottom, { width: 10, y: 3, rotate: 0, duration: 0.3, ease: "power3.inOut" });
    }
  }, []);

  const animateText = useCallback((opening: boolean) => {
    if (!textInnerRef.current) return;
    gsap.to(textInnerRef.current, {
      yPercent: opening ? -50 : 0,
      duration: 0.4,
      ease: "power4.out",
    });
  }, []);

  const openMenu = useCallback(() => {
    if (openRef.current) return;
    openRef.current = true;
    setOpen(true);
    lockScroll(true);
    playOpen();
    playLogoIn();
    animateIcon(true);
    animateText(true);
  }, [animateIcon, animateText, lockScroll, playLogoIn, playOpen]);

  const closeMenu = useCallback(() => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    lockScroll(false);
    playClose();
    playLogoOut();
    animateIcon(false);
    animateText(false);
    toggleRef.current?.focus();
  }, [animateIcon, animateText, lockScroll, playClose, playLogoOut]);

  function toggleMenu() {
    if (openRef.current) closeMenu();
    else openMenu();
  }

  function toggleAccordion(i: number) {
    const reduced = reducedMotion();
    const d = reduced ? 0 : 1;
    const activeIndex = expandedRef.current;
    accordionTlRef.current?.kill();

    function collapse(idx: number, onComplete?: () => void) {
      const c = clipRefs.current[idx];
      const chev = chevronRefs.current[idx];
      const kids = subRefs.current[idx]?.filter((el): el is HTMLAnchorElement => !!el) ?? [];
      if (!c) return null;
      const closeTl = gsap.timeline({ paused: true, onComplete });
      if (kids.length)
        closeTl.to(
          kids,
          { opacity: 0, y: -6, duration: 0.2 * d, stagger: 0.03 * d, ease: "power2.in" },
          0,
        );
      closeTl.to(c, { height: 0, duration: 0.3 * d, ease: "power2.inOut" }, 0.05 * d);
      if (chev) closeTl.to(chev, { rotate: 0, duration: 0.3 * d, ease: "power2.out" }, 0);
      return closeTl;
    }

    function open() {
      const clip = clipRefs.current[i];
      const chevron = chevronRefs.current[i];
      const children = subRefs.current[i]?.filter((el): el is HTMLAnchorElement => !!el) ?? [];
      if (!clip) return;

      const targetHeight = measureHeight(clip);
      gsap.set(children, { opacity: 0, y: -8 });
      const openTl = gsap.timeline();
      openTl.to(clip, { height: targetHeight, duration: 0.4 * d, ease: "power3.out" }, 0);
      if (children.length) {
        openTl.to(
          children,
          { opacity: 1, y: 0, duration: 0.35 * d, stagger: 0.05 * d, ease: "power2.out" },
          0.08 * d,
        );
      }
      if (chevron) openTl.to(chevron, { rotate: 180, duration: 0.35 * d, ease: "power2.out" }, 0);
      accordionTlRef.current = openTl;
    }

    if (activeIndex === i) {
      setExpandedIndex(null);
      const closeTl = collapse(i, () => {
        expandedRef.current = null;
        accordionTlRef.current = null;
      });
      accordionTlRef.current = closeTl;
      closeTl?.play(0);
      return;
    }

    const openNext = () => {
      expandedRef.current = i;
      setExpandedIndex(i);
      open();
    };

    if (activeIndex !== null) {
      setExpandedIndex(null);
      const closeTl = collapse(activeIndex, openNext);
      accordionTlRef.current = closeTl;
      closeTl?.play(0);
      return;
    }

    openNext();
  }

  function handleToggleHoverIn() {
    if (reducedMotion() || openRef.current) return;
    gsap.to(iconTopRef.current, { y: -4, duration: 0.25, ease: "power2.out" });
    gsap.to(iconBottomRef.current, { y: 4, width: 16, duration: 0.25, ease: "power2.out" });
  }
  function handleToggleHoverOut() {
    if (openRef.current) return;
    gsap.to(iconTopRef.current, { y: -3, duration: 0.25, ease: "power2.inOut" });
    gsap.to(iconBottomRef.current, { y: 3, width: 10, duration: 0.25, ease: "power2.inOut" });
  }

  function hoverIn(i: number) {
    if (reducedMotion()) return;
    hoverTimelines.current[i]?.play();
  }
  function hoverOut(i: number) {
    hoverTimelines.current[i]?.reverse();
  }

  // Escape closes the menu; a route change (a link was followed) does too.
  useLayoutEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    closeMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useLayoutEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeMenu]);

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        onClick={toggleMenu}
        onMouseEnter={handleToggleHoverIn}
        onMouseLeave={handleToggleHoverOut}
        aria-expanded={open}
        aria-controls="site-nav-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        className="relative z-10 flex items-center gap-2.5 rounded-full py-1.5 pr-1 pl-3 text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/10"
      >
        <span className="hidden h-[1em] w-11 overflow-hidden text-xs leading-none font-semibold tracking-wide uppercase sm:block">
          <span ref={textInnerRef} className="flex flex-col">
            <span className="block h-[1em] leading-none">Menu</span>
            <span className="block h-[1em] leading-none">Close</span>
          </span>
        </span>
        <span className="relative flex size-8 items-center justify-center">
          <span ref={iconTopRef} className="absolute h-[2px] w-4 rounded-full bg-current" />
          <span ref={iconBottomRef} className="absolute h-[2px] w-2.5 rounded-full bg-current" />
        </span>
      </button>

      {/* `invisible opacity-0` below is the closed state's CSS baseline, not
          just an animation starting point — the server-rendered HTML (and
          the gap before hydration) has no JS at all, so without a CSS
          default these would render at their natural, fully visible
          position for that first paint: a flash of the open menu that then
          animates away. The mount effect re-asserts the same result via
          GSAP's `autoAlpha` once JS runs (simple opacity/visibility, so it
          cleanly overrides the classes — unlike `transform`, GSAP appears
          to preserve and stack onto whatever transform a CSS class already
          put on the element rather than replacing it, which is why the
          off-screen position below comes from GSAP alone (xPercent), never
          from a CSS transform class). */}
      <div
        ref={overlayRef}
        onClick={closeMenu}
        aria-hidden
        className="invisible fixed inset-x-0 top-16 bottom-0 z-40 bg-white/70 opacity-0 backdrop-blur-md dark:bg-black/55"
      />

      {/* The blurred backdrop's own left side is otherwise empty — each
          shard already defaults to its own inline opacity:0 (see
          hero/shapes.tsx), so there's nothing to see here until playLogoIn
          runs; no separate SSR-safe default needed for the container. Only
          shown once there's actually room beside the panel for it. */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-16 bottom-0 left-0 z-40 hidden items-center justify-center lg:right-[460px] lg:flex"
      >
        <ShardLogo className="nav-logo size-56" />
      </div>

      <div className="pointer-events-none fixed top-16 right-0 bottom-0 z-40 w-full sm:w-[420px] lg:w-[460px]">
        <div className="absolute inset-0 flex">
          {LAYER_COLORS.map((c, i) => (
            <div
              key={c}
              ref={(el) => {
                layerRefs.current[i] = el;
              }}
              className="invisible absolute inset-0"
              style={{ background: c }}
            />
          ))}
        </div>

        <aside
          id="site-nav-panel"
          ref={panelRef}
          aria-hidden={!open}
          inert={!open ? true : undefined}
          className="invisible pointer-events-auto absolute inset-0 flex flex-col overflow-y-auto border-l border-[var(--line)] bg-[var(--surface-muted)] px-6 pt-[clamp(1rem,4dvh,2rem)] pb-[clamp(0.75rem,3dvh,1.5rem)] text-foreground opacity-0 sm:px-10"
        >
          <p className="text-[11px] font-semibold tracking-[0.2em] text-foreground/40 uppercase">
            Menu
          </p>

          {/* Every item's font-size, gap, and padding below is in `em` off
              this one viewport-height-driven clamp, so the whole list scales
              as one unit — on a short viewport it shrinks enough that all
              eight items plus socials and the legal row fit with no scroll,
              instead of overflowing at a fixed size. */}
          <nav className="mt-[2dvh] flex flex-col text-[clamp(1rem,2.7dvh,1.75rem)]">
            {NAV_ITEMS.map((item, i) => {
              const accentVar = toneColor(item.accent);
              const accentStyle = { "--nav-item-accent": accentVar } as CSSProperties;
              return (
                <div
                  key={item.label}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  className="border-b border-[var(--line)] last:border-b-0"
                >
                  {item.kind === "link" ? (
                    <Link
                      href={item.href}
                      ref={(el) => {
                        if (i === 0) firstLinkRef.current = el;
                      }}
                      onMouseEnter={() => hoverIn(i)}
                      onMouseLeave={() => hoverOut(i)}
                      onFocus={() => hoverIn(i)}
                      onBlur={() => hoverOut(i)}
                      onClick={closeMenu}
                      style={accentStyle}
                      className="group relative flex items-baseline gap-[0.7em] py-[0.1em]"
                    >
                      <ItemFill
                        setRef={(el) => {
                          fillRefs.current[i] = el;
                        }}
                        accentVar={accentVar}
                      />
                      <span
                        ref={(el) => {
                          numberRefs.current[i] = el;
                        }}
                        className="font-mono text-[0.45em] text-foreground/30 tabular-nums transition-colors group-hover:text-[var(--nav-item-accent)] group-focus:text-[var(--nav-item-accent)]"
                      >
                        {pad(i + 1)}
                      </span>
                      <span
                        ref={(el) => {
                          labelRefs.current[i] = el;
                        }}
                        className="font-display text-[1em] font-semibold tracking-tight text-foreground transition-colors group-hover:text-[var(--nav-item-accent)] group-focus:text-[var(--nav-item-accent)]"
                      >
                        {item.label}
                      </span>
                      <ArrowUpRight
                        ref={(el) => {
                          arrowRefs.current[i] = el;
                        }}
                        className="size-[0.7em] -translate-x-2 text-foreground opacity-0"
                      />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      ref={(el) => {
                        if (i === 0) firstLinkRef.current = el;
                      }}
                      onClick={() => toggleAccordion(i)}
                      onMouseEnter={() => hoverIn(i)}
                      onMouseLeave={() => hoverOut(i)}
                      onFocus={() => hoverIn(i)}
                      onBlur={() => hoverOut(i)}
                      aria-expanded={expandedIndex === i}
                      aria-controls={`nav-dropdown-${i}`}
                      style={accentStyle}
                      className="group relative flex w-full items-baseline gap-[0.7em] py-[0.1em] text-left"
                    >
                      <ItemFill
                        setRef={(el) => {
                          fillRefs.current[i] = el;
                        }}
                        accentVar={accentVar}
                      />
                      <span
                        ref={(el) => {
                          numberRefs.current[i] = el;
                        }}
                        className="font-mono text-[0.45em] text-foreground/30 tabular-nums transition-colors group-hover:text-[var(--nav-item-accent)] group-focus:text-[var(--nav-item-accent)]"
                      >
                        {pad(i + 1)}
                      </span>
                      <span
                        ref={(el) => {
                          labelRefs.current[i] = el;
                        }}
                        className="font-display text-[1em] font-semibold tracking-tight text-foreground transition-colors group-hover:text-[var(--nav-item-accent)] group-focus:text-[var(--nav-item-accent)]"
                      >
                        {item.label}
                      </span>
                      <ChevronDown
                        ref={(el) => {
                          chevronRefs.current[i] = el;
                        }}
                        className="size-[0.7em] text-foreground/40"
                      />
                    </button>
                  )}

                  {item.kind === "dropdown" && (
                    <div
                      id={`nav-dropdown-${i}`}
                      ref={(el) => {
                        clipRefs.current[i] = el;
                      }}
                      className="overflow-hidden"
                      style={{ height: 0 }}
                    >
                      {item.label === "Focus" ? (
                        <FocusBento
                          items={item.items}
                          onNavigate={closeMenu}
                          registerRef={(si, el) => {
                            if (!subRefs.current[i]) subRefs.current[i] = [];
                            subRefs.current[i][si] = el;
                          }}
                        />
                      ) : (
                        <WorkBento
                          items={item.items}
                          onNavigate={closeMenu}
                          registerRef={(si, el) => {
                            if (!subRefs.current[i]) subRefs.current[i] = [];
                            subRefs.current[i][si] = el;
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-[clamp(0.3rem,1dvh,0.85rem)] pt-[clamp(0.4rem,1.2dvh,1.25rem)] text-[clamp(0.7rem,1.7dvh,0.95rem)]">
            <div className="flex flex-col gap-[clamp(0.3rem,0.8dvh,0.6rem)]">
              <p className="text-[11px] font-semibold tracking-wide text-foreground/40 uppercase">
                Let&apos;s Talk
              </p>
              <EmailReveal email={CONTACT_EMAIL} />
            </div>

            <div className="flex flex-col gap-[clamp(0.3rem,0.8dvh,0.6rem)] border-t border-[var(--line)] pt-[clamp(0.5rem,1.5dvh,1.25rem)]">
              <p className="text-[11px] font-semibold tracking-wide text-foreground/40 uppercase">
                Socials
              </p>
              <div className="flex flex-wrap items-center gap-[clamp(0.6rem,1.6dvh,1.1rem)]">
                {NAV_SOCIALS.map((s, i) => {
                  const Icon = SOCIAL_ICONS[s.label];
                  const accentStyle = {
                    "--social-accent": SOCIAL_ACCENTS[i % SOCIAL_ACCENTS.length],
                  } as CSSProperties;
                  return (
                    <a
                      key={s.label}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={s.label}
                      onMouseEnter={() => socialHoverIn(i)}
                      onMouseLeave={() => socialHoverOut(i)}
                      onFocus={() => socialHoverIn(i)}
                      onBlur={() => socialHoverOut(i)}
                      style={accentStyle}
                      className="text-foreground/60 transition-colors hover:text-[var(--social-accent)] focus:text-[var(--social-accent)]"
                    >
                      {Icon && (
                        <Icon
                          ref={(el) => {
                            socialRefs.current[i] = el;
                          }}
                          className="size-[clamp(0.9rem,2.2dvh,1.375rem)]"
                        />
                      )}
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-[clamp(0.75rem,2dvh,1.25rem)] border-t border-[var(--line)] pt-[clamp(0.35rem,1dvh,0.75rem)] text-[clamp(0.6rem,1.5dvh,0.75rem)] text-foreground/40">
              <span className="whitespace-nowrap">
                <span className="text-foreground/60">Malang (ID)</span> {wibTime ?? "--:--"}
              </span>
              {LEGAL_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={closeMenu}
                  className="transition-colors hover:text-foreground"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function ItemFill({
  setRef,
  accentVar,
}: {
  setRef: (el: HTMLSpanElement | null) => void;
  accentVar: string;
}) {
  return (
    <span
      aria-hidden
      ref={setRef}
      className="pointer-events-none absolute inset-y-0 -left-4 w-[calc(100%+2rem)] origin-left scale-x-0 rounded-xl"
      style={{ background: `color-mix(in srgb, ${accentVar} 18%, transparent)` }}
    />
  );
}
