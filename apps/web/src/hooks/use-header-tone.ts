"use client";

import { useEffect, useRef, type RefObject } from "react";
import { usePathname } from "next/navigation";

import {
  decideTone,
  headerToneProviders,
  onHeaderToneRequest,
  parseCssColor,
  rgbaCss,
  rgbCss,
  toneOf,
  type HeaderToneSample,
  type HeaderToneZone,
  type HeaderToneZoneId,
  type Rgb,
  type Tone,
  type ToneChoice,
  type TonePalette,
  type TonePreferences,
} from "@/lib/header-tone";
import { pageBaseColor, probePoint } from "@/lib/header-tone-probe";
import { isArticleTransitionBusy, onArticleTransitionChange } from "@/lib/article-transition";
import { isProjectTransitionBusy, onProjectTransitionChange } from "@/lib/project-transition";
import { isRouteCoverActive, onRouteCoverChange } from "@/lib/route-reveal";

/**
 * The adaptive header's scheduler (see lib/header-tone.ts for the rule and
 * lib/header-tone-probe.ts for the sampling). It samples what is behind
 * each zone of the bar, and behind the menu panel while it is open, and
 * writes the chosen colours as inline custom properties on the header
 * (the zones' --hz-* variables) and on the panel (data-tone, --nav-alpha).
 *
 * When: on arrival and route changes (then a few more times while the page
 * settles), on scroll (at most 10 times a second, plus a few samples after
 * it stops, while the smooth scrollers glide on), on resize, on a theme
 * switch, when a picture near the header loads, when the menu opens, when
 * a page asks (`requestHeaderToneSample`). Nothing runs while idle.
 *
 * Never during a page transition: the curtain covers everything, and the
 * project zoom and the detail hand-off walk the header's palette through
 * the --project-* variables. While one runs the header's inline values are
 * removed, so its static CSS follows the walk, and sampling resumes once
 * it ends.
 *
 * Reduced transparency, or no backdrop-filter: the glass is opaque, so the
 * rule reduces to the header's own colours on its own surface (which the
 * themes already guarantee). The scheduler stands down and writes nothing.
 */

const MIN_INTERVAL_MS = 100;
/** After the last scroll event: ScrollSmoother and Lenis keep content moving. */
const SETTLE_MS = [160, 600, 1200];
/** After arriving: entrances, late layout, pictures decoding. */
const ARRIVAL_MS = [120, 500, 1100, 2200];

const BAR_ZONES = ["logo", "centre", "controls"] as const;
type BarZone = (typeof BAR_ZONES)[number];

/** The weakest text's opacity in each zone (the logo's 70% caption, the panel's 65% labels). */
const TEXT_MIX: Record<HeaderToneZoneId, number> = {
  logo: 0.7,
  centre: 1,
  controls: 1,
  panel: 0.65,
};
const HEADER_SATURATE = 1.8;
const PANEL_SATURATE = 1.7;

const TRANSPARENCY_QUERY = "(prefers-reduced-transparency: reduce)";

type Measured = {
  zones: HeaderToneZone[];
  logoStop: number;
  controlsStop: number;
  panel: HTMLElement | null;
};

type Snapshot = {
  zone: HeaderToneZoneId;
  tone: Tone;
  flip: boolean;
  alpha: number;
  contrast: number;
  media: boolean;
  samples: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readColor(style: CSSStyleDeclaration, name: string, fallback: Rgb): Rgb {
  const parsed = parseCssColor(style.getPropertyValue(name));
  return parsed && parsed.alpha > 0 ? parsed.rgb : fallback;
}

function readPercent(style: CSSStyleDeclaration, name: string, fallback: number) {
  const value = Number.parseFloat(style.getPropertyValue(name));
  return Number.isFinite(value) ? clamp(value / 100, 0, 1) : fallback;
}

function menuToggle(header: HTMLElement) {
  return header.querySelector<HTMLElement>('[aria-controls="site-nav-panel"]');
}

function glassSupported() {
  return (
    typeof CSS !== "undefined" &&
    (CSS.supports("backdrop-filter", "blur(1px)") ||
      CSS.supports("-webkit-backdrop-filter", "blur(1px)"))
  );
}

class HeaderToneController {
  private readonly header: HTMLElement;
  private disposed = false;
  private held = false;
  private frameId = 0;
  private timerId = 0;
  private lastSample = -Infinity;
  private readonly trailing: number[] = [];
  private readonly offs: (() => void)[] = [];
  private readonly written = new Map<string, string>();
  private readonly attributes = new Map<string, string>();
  private panelWritten: HTMLElement | null = null;
  private readonly tones = new Map<HeaderToneZoneId, Tone>();
  private dark = false;
  private transparency: MediaQueryList | null = null;
  private snapshot: Snapshot[] = [];
  private samplesTaken = 0;
  private sampleMs = 0;

  constructor(header: HTMLElement) {
    this.header = header;
  }

  start() {
    const passive = { passive: true } as const;
    const listen = <K extends keyof WindowEventMap>(
      type: K,
      handler: (event: WindowEventMap[K]) => void,
    ) => {
      window.addEventListener(type, handler, passive);
      this.offs.push(() => window.removeEventListener(type, handler));
    };
    listen("scroll", this.onScroll);
    listen("resize", this.arrive);

    document.addEventListener("visibilitychange", this.onVisibility);
    document.addEventListener("load", this.onMediaLoad, true);
    document.addEventListener("loadeddata", this.onMediaLoad, true);
    this.offs.push(() => {
      document.removeEventListener("visibilitychange", this.onVisibility);
      document.removeEventListener("load", this.onMediaLoad, true);
      document.removeEventListener("loadeddata", this.onMediaLoad, true);
    });

    this.dark = document.documentElement.classList.contains("dark");
    const themeObserver = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains("dark");
      if (dark === this.dark) return;
      this.dark = dark;
      this.arrive();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    const menuObserver = new MutationObserver((records) => {
      const toggled = records.some(
        (record) =>
          record.target instanceof HTMLElement &&
          record.target.getAttribute("aria-controls") === "site-nav-panel",
      );
      if (toggled) this.onMenuToggle();
    });
    menuObserver.observe(this.header, {
      attributes: true,
      subtree: true,
      attributeFilter: ["aria-expanded"],
    });
    this.offs.push(() => {
      themeObserver.disconnect();
      menuObserver.disconnect();
    });

    this.transparency = window.matchMedia(TRANSPARENCY_QUERY);
    this.transparency.addEventListener("change", this.arrive);
    this.offs.push(() => this.transparency?.removeEventListener("change", this.arrive));

    this.offs.push(onHeaderToneRequest(this.request));
    this.offs.push(onRouteCoverChange(this.onBusyChange));
    this.offs.push(onProjectTransitionChange(this.onBusyChange));
    this.offs.push(onArticleTransitionChange(this.onBusyChange));

    if (process.env.NODE_ENV !== "production") {
      const view = {
        state: () => ({
          held: this.held,
          opaque: this.opaque(),
          busy: this.busy(),
          samples: this.samplesTaken,
          sampleMs: Number(this.sampleMs.toFixed(2)),
          zones: this.snapshot,
          written: Object.fromEntries(this.written),
          attributes: Object.fromEntries(this.attributes),
        }),
        sample: () => this.sampleNow(),
      };
      Object.assign(window, { __headerTone: view });
      this.offs.push(() => {
        const target = window as { __headerTone?: unknown };
        if (target.__headerTone === view) delete target.__headerTone;
      });
    }

    this.arrive();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
    this.cancel();
    this.clear();
  }

  /** A route committed: sample the new page as it settles. */
  routeChanged() {
    this.arrive();
  }

  // ------------------------------------------------------------ scheduling

  private readonly onScroll = () => {
    this.request();
    this.settle(SETTLE_MS);
  };

  private readonly onVisibility = () => {
    if (!document.hidden) this.arrive();
  };

  private readonly onMediaLoad = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement || target instanceof HTMLVideoElement)) return;
    const menuOpen = menuToggle(this.header)?.getAttribute("aria-expanded") === "true";
    if (!menuOpen && target.getBoundingClientRect().top > this.header.offsetHeight + 8) return;
    this.request();
  };

  private readonly onMenuToggle = () => {
    // Opening: sample right away, before the panel slides in, so it arrives
    // in its tone instead of changing colour on the way.
    if (this.busy() || this.opaque()) return;
    this.cancel();
    this.sampleNow();
  };

  private readonly onBusyChange = () => {
    if (this.busy()) {
      this.hold();
      return;
    }
    if (!this.held) return;
    this.held = false;
    this.arrive();
  };

  private readonly arrive = () => {
    this.request();
    this.settle(ARRIVAL_MS);
  };

  private readonly request = () => {
    if (this.disposed) return;
    if (this.busy()) {
      this.hold();
      return;
    }
    if (this.frameId || this.timerId) return;
    const wait = this.lastSample + MIN_INTERVAL_MS - performance.now();
    if (wait > 0) {
      this.timerId = window.setTimeout(() => {
        this.timerId = 0;
        this.frameId = window.requestAnimationFrame(this.frame);
      }, wait);
    } else {
      this.frameId = window.requestAnimationFrame(this.frame);
    }
  };

  private readonly frame = () => {
    this.frameId = 0;
    if (this.disposed) return;
    if (this.busy()) {
      this.hold();
      return;
    }
    if (document.hidden) return;
    this.sampleNow();
  };

  private settle(delays: readonly number[]) {
    for (const id of this.trailing.splice(0)) window.clearTimeout(id);
    for (const delay of delays) this.trailing.push(window.setTimeout(this.request, delay));
  }

  private cancel() {
    window.cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.timerId);
    this.frameId = 0;
    this.timerId = 0;
  }

  private busy() {
    return isRouteCoverActive() || isProjectTransitionBusy() || isArticleTransitionBusy();
  }

  private opaque() {
    return Boolean(this.transparency?.matches) || !glassSupported();
  }

  /** A transition took over: hand the header's colours back to its CSS. */
  private hold() {
    if (this.held) return;
    this.held = true;
    this.cancel();
    for (const id of this.trailing.splice(0)) window.clearTimeout(id);
    this.clear();
  }

  // -------------------------------------------------------------- sampling

  private measure(): Measured {
    const header = this.header;
    const bar = header.getBoundingClientRect();
    const width = window.innerWidth;
    const ys = [bar.top + bar.height * 0.3, bar.top + bar.height * 0.7];
    const across = (left: number, right: number) => {
      const l = clamp(left, 1, width - 1);
      const r = clamp(right, l + 1, width - 1);
      const xs = [l + Math.min(6, (r - l) / 4), (l + r) / 2, r - Math.min(6, (r - l) / 4)];
      return ys.flatMap((y) => xs.map((x) => ({ x, y })));
    };

    const logo = header.querySelector('[data-header-zone="logo"]')?.getBoundingClientRect();
    const controls = header.querySelector('[data-header-zone="controls"]')?.getBoundingClientRect();
    const pill = header.querySelector("[data-project-back]")?.getBoundingClientRect();
    const middle = bar.left + bar.width / 2;
    const pillCentred =
      pill && pill.width > 0 && Math.abs(pill.left + pill.width / 2 - middle) < bar.width * 0.1;
    const half = Math.max(40, bar.width * 0.06);
    const centre = pillCentred ? pill : { left: middle - half, right: middle + half };
    const logoBox = logo && logo.width > 0 ? logo : { left: bar.left + 24, right: bar.left + 140 };
    const controlsBox =
      controls && controls.width > 0 ? controls : { left: bar.right - 150, right: bar.right - 24 };

    const zones: HeaderToneZone[] = [
      { id: "logo", points: across(logoBox.left - 8, logoBox.right + 8) },
      { id: "centre", points: across(centre.left, centre.right) },
      { id: "controls", points: across(controlsBox.left - 8, controlsBox.right + 8) },
    ];

    let panel: HTMLElement | null = null;
    if (menuToggle(header)?.getAttribute("aria-expanded") === "true") {
      panel = document.getElementById("site-nav-panel");
      const region = panel?.parentElement?.getBoundingClientRect();
      if (panel && region && region.width > 0 && region.height > 0) {
        const xs = [0.18, 0.5, 0.82].map((share) => region.left + region.width * share);
        const rows = [0.06, 0.22, 0.38, 0.54, 0.7, 0.86, 0.97];
        const points = rows.flatMap((share) => {
          const y = clamp(region.top + region.height * share, 0, window.innerHeight - 1);
          return xs.map((x) => ({ x: clamp(x, 1, width - 1), y }));
        });
        zones.push({ id: "panel", points });
      } else {
        panel = null;
      }
    }

    const logoStop = clamp(logoBox.right + 24 - bar.left, 0, bar.width * 0.45);
    const controlsStop = clamp(controlsBox.left - 24 - bar.left, bar.width * 0.55, bar.width);
    return { zones, logoStop, controlsStop, panel };
  }

  private collect(zones: readonly HeaderToneZone[]): HeaderToneSample[][] {
    const answers: (HeaderToneSample | undefined)[][] = zones.map((zone) =>
      zone.points.map(() => undefined),
    );
    for (const provider of headerToneProviders()) {
      let result: ReturnType<typeof provider>;
      try {
        result = provider(zones);
      } catch {
        continue;
      }
      if (!result) continue;
      result.forEach((zoneAnswer, zoneIndex) => {
        zoneAnswer?.forEach((sample, pointIndex) => {
          if (sample && answers[zoneIndex] && !answers[zoneIndex][pointIndex]) {
            answers[zoneIndex][pointIndex] = sample;
          }
        });
      });
    }
    const header = this.header;
    const skip = (element: Element) => header.contains(element);
    const base = pageBaseColor();
    return zones.map((zone, zoneIndex) =>
      zone.points.map(
        (point, pointIndex) =>
          answers[zoneIndex][pointIndex] ?? probePoint(point.x, point.y, skip, base),
      ),
    );
  }

  private preferences(menuOpen: boolean) {
    const root = getComputedStyle(document.documentElement);
    const own = getComputedStyle(this.header);
    const light: TonePalette = {
      ink: readColor(root, "--tone-light-ink", [14, 17, 22]),
      surface: readColor(root, "--tone-light-surface", [247, 247, 245]),
    };
    const dark: TonePalette = {
      ink: readColor(root, "--tone-dark-ink", [237, 237, 237]),
      surface: readColor(root, "--tone-dark-surface", [21, 24, 30]),
    };
    const panelAlpha = readPercent(root, "--nav-glass-alpha", 0.76);
    const headerAlpha = readPercent(own, "--header-glass-alpha", 0.6);
    const bar: TonePreferences = {
      preferred: {
        ink: readColor(own, "--header-ink", light.ink),
        surface: readColor(own, "--header-surface", light.surface),
      },
      light,
      dark,
      // Menu open: the bar matches the panel's denser glass.
      alpha: menuOpen ? Math.max(headerAlpha, panelAlpha) : headerAlpha,
      saturate: HEADER_SATURATE,
    };
    // The panel keeps the site's colours by default (never a project's).
    const panel: TonePreferences = {
      preferred: {
        ink: readColor(root, "--foreground", light.ink),
        surface: readColor(root, "--background", light.surface),
      },
      light,
      dark,
      alpha: panelAlpha,
      saturate: PANEL_SATURATE,
    };
    return { bar, panel };
  }

  private sampleNow() {
    if (this.disposed) return;
    this.lastSample = performance.now();
    if (this.opaque()) {
      this.clear();
      return;
    }
    this.samplesTaken += 1;
    const started = performance.now();
    const measured = this.measure();
    const samples = this.collect(measured.zones);
    const prefs = this.preferences(Boolean(measured.panel));
    const choices = new Map<HeaderToneZoneId, ToneChoice>();
    const snapshot: Snapshot[] = [];
    measured.zones.forEach((zone, index) => {
      const choice = decideTone(samples[index], zone.id === "panel" ? prefs.panel : prefs.bar, {
        textMix: TEXT_MIX[zone.id],
        previous: this.tones.get(zone.id),
      });
      this.tones.set(zone.id, choice.tone);
      choices.set(zone.id, choice);
      snapshot.push({
        zone: zone.id,
        tone: choice.tone,
        flip: choice.flip,
        alpha: Number(choice.alpha.toFixed(3)),
        contrast: Number(choice.contrast.toFixed(2)),
        media: choice.media,
        samples: samples[index].length,
      });
    });
    this.snapshot = snapshot;
    this.write(choices, measured);
    this.sampleMs = performance.now() - started;
  }

  // --------------------------------------------------------------- writing

  private setProperty(name: string, value: string) {
    if (this.written.get(name) === value) return;
    this.written.set(name, value);
    this.header.style.setProperty(name, value);
  }

  private setAttribute(name: string, value: string | null) {
    if (value === null) {
      if (!this.attributes.has(name)) return;
      this.attributes.delete(name);
      this.header.removeAttribute(name);
      return;
    }
    if (this.attributes.get(name) === value) return;
    this.attributes.set(name, value);
    this.header.setAttribute(name, value);
  }

  private write(choices: Map<HeaderToneZoneId, ToneChoice>, measured: Measured) {
    for (const zone of BAR_ZONES) {
      const choice = choices.get(zone);
      if (!choice) continue;
      this.writeZone(zone, choice);
    }
    this.setProperty("--hz-logo-stop", `${measured.logoStop.toFixed(0)}px`);
    this.setProperty("--hz-controls-stop", `${measured.controlsStop.toFixed(0)}px`);

    const panel = measured.panel;
    const panelChoice = choices.get("panel");
    if (panel && panelChoice) {
      if (this.panelWritten && this.panelWritten !== panel) this.clearPanel();
      this.panelWritten = panel;
      const tone = toneOf(panelChoice.surface);
      if (panel.dataset.tone !== tone) panel.dataset.tone = tone;
      const alpha = `${(panelChoice.alpha * 100).toFixed(1)}%`;
      if (panel.style.getPropertyValue("--nav-alpha") !== alpha) {
        panel.style.setProperty("--nav-alpha", alpha);
      }
    }
  }

  private writeZone(zone: BarZone, choice: ToneChoice) {
    this.setProperty(`--hz-${zone}-ink`, rgbCss(choice.ink));
    this.setProperty(`--hz-${zone}-tint`, rgbaCss(choice.surface, choice.alpha));
    this.setProperty(`--hz-${zone}-solid`, rgbCss(choice.surface));
    this.setAttribute(`data-hz-${zone}`, choice.flip ? "flip" : "keep");
    this.setAttribute(`data-hz-${zone}-media`, choice.media ? "" : null);
  }

  private clearPanel() {
    const panel = this.panelWritten;
    if (!panel) return;
    delete panel.dataset.tone;
    panel.style.removeProperty("--nav-alpha");
    this.panelWritten = null;
  }

  /** Removes everything written: the header's and the panel's CSS apply again. */
  private clear() {
    for (const name of this.written.keys()) this.header.style.removeProperty(name);
    this.written.clear();
    for (const name of this.attributes.keys()) this.header.removeAttribute(name);
    this.attributes.clear();
    this.clearPanel();
    this.snapshot = [];
  }
}

/**
 * Runs the adaptive header on `headerRef` while it is mounted (see the
 * module comment). Route changes restart the settle samples.
 */
export function useHeaderTone(headerRef: RefObject<HTMLElement | null>) {
  const pathname = usePathname();
  const controllerRef = useRef<HeaderToneController | null>(null);
  const firstPath = useRef(true);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const controller = new HeaderToneController(header);
    controllerRef.current = controller;
    controller.start();
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [headerRef]);

  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    controllerRef.current?.routeChanged();
  }, [pathname]);
}
