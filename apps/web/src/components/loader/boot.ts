/**
 * The decisions made before the first paint of every hard load, by the
 * inline script in the root layout's head (`boot-script.tsx`, the pattern of
 * Next's "Preventing flash before hydration" guide):
 *
 * - `html[data-story-mode]`: "gl" when the homepage story can run here
 *   (on `/`, motion allowed, no `?nostory`, not given up earlier in this
 *   tab, and a hardware WebGL2 context: the same probe as
 *   `reel/gl/webgl-probe.ts`), else "dom" (the storybook). CSS shows one
 *   version from the first paint, so the section's height never jumps.
 * - `html[data-loader]`: "active" when the loading screen shows (a public
 *   route, not under `navigator.webdriver` unless `?loader=1`), else
 *   "done". Specs wait for `html[data-loader="done"]`.
 * - `--story-vh` on `<html>`: the viewport height in px, so the story's
 *   tall section has its real height before any script runs.
 *
 * Without JavaScript none of this runs: no attributes, so the CSS default
 * is the storybook and a hidden loader. `readBoot()` gives the client the
 * same decisions; `reapplyBoot()` puts the attributes back after React's
 * development remount resets `<html>` (a no-op in production).
 */

export type BootState = Readonly<{
  story: "gl" | "dom";
  /**
   * Whether `story` was decided here. The probe runs only on a hard load of
   * `/`; a visit that starts elsewhere decides when the homepage first
   * mounts (`decideStoryMode`).
   */
  storyDecided: boolean;
  loader: boolean;
  /** A loader already finished in this tab (the fast path). */
  repeat: boolean;
  vh: number;
}>;

export const LOADER_KEY = "mgm:loader";
export const STORY_KEY = "mgm:story";

export const BOOT_SCRIPT = `(function(){var d=document.documentElement,w=window,b={story:"dom",storyDecided:false,loader:false,repeat:false,vh:w.innerHeight};try{var q=w.location.search,p=w.location.pathname,s=null;try{s=w.sessionStorage}catch(e){}if(s){b.repeat=s.getItem("${LOADER_KEY}")==="1"}d.style.setProperty("--story-vh",b.vh+"px");var calm=w.matchMedia("(prefers-reduced-motion: no-preference)").matches;if(p==="/")b.storyDecided=true;if(p==="/"&&calm&&!/[?&]nostory(=|&|$)/.test(q)&&!(s&&s.getItem("${STORY_KEY}")==="dom")){try{var c=document.createElement("canvas"),g=c.getContext("webgl2",{failIfMajorPerformanceCaveat:true});if(g){var x=g.getExtension("WEBGL_debug_renderer_info"),r=x?String(g.getParameter(x.UNMASKED_RENDERER_WEBGL)):"";if(!/swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i.test(r))b.story="gl";var l=g.getExtension("WEBGL_lose_context");if(l)l.loseContext()}}catch(e){}}var ex=/^\\/(admin|forms|s)(\\/|$)/.test(p);b.loader=!ex&&(/[?&]loader=1(&|$)/.test(q)||!navigator.webdriver)}catch(e){}d.setAttribute("data-story-mode",b.story);d.setAttribute("data-loader",b.loader?"active":"done");w.__mgmBoot=b})()`;

type BootWindow = Window & { __mgmBoot?: BootState };

const FALLBACK: BootState = {
  story: "dom",
  storyDecided: false,
  loader: false,
  repeat: false,
  vh: 800,
};

/** The boot decisions (the storybook and no loader when the script did not run). */
export function readBoot(): BootState {
  if (typeof window === "undefined") return FALLBACK;
  return (window as BootWindow).__mgmBoot ?? { ...FALLBACK, vh: window.innerHeight };
}

/** Updates a decision after boot (the story fell back, the loader finished). */
export function updateBoot(patch: Partial<BootState>) {
  const next = { ...readBoot(), ...patch };
  (window as BootWindow).__mgmBoot = next;
  reapplyBoot();
}

/** Puts the boot attributes back on `<html>` (React's dev remount clears them). */
export function reapplyBoot() {
  const boot = readBoot();
  const root = document.documentElement;
  if (root.getAttribute("data-story-mode") !== boot.story)
    root.setAttribute("data-story-mode", boot.story);
  const loader = boot.loader ? "active" : "done";
  if (root.getAttribute("data-loader") !== loader) root.setAttribute("data-loader", loader);
  if (!root.style.getPropertyValue("--story-vh"))
    root.style.setProperty("--story-vh", `${boot.vh}px`);
}
