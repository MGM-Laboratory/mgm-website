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
 * - `html[data-loader-fast]`: present while a loader shows that already
 *   finished once in this tab (a reload), so its first paint can be the
 *   short version.
 * - `--story-vh` on `<html>`: the viewport height in px, so the story's
 *   tall section has its real height before any script runs.
 *
 * - A failsafe that needs nothing but this script: when the app has not
 *   started after 12 s of visible time (a chunk that failed to load, a
 *   blocked script, a crash before hydration), it hides the loader and
 *   picks the storybook, whose server HTML works without the bundle. The
 *   client marks itself started (`markBootLive()`, from the loader core) the
 *   moment it runs, which stands the failsafe down.
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
/** Visible milliseconds the boot script waits for the app before it gives up on it. */
export const BOOT_GIVE_UP_MS = 12_000;
export const STORY_KEY = "mgm:story";

export const BOOT_SCRIPT = `(function(){var d=document.documentElement,w=window,b={story:"dom",storyDecided:false,loader:false,repeat:false,vh:w.innerHeight};try{var q=w.location.search,p=w.location.pathname,s=null;try{s=w.sessionStorage}catch(e){}if(s){b.repeat=s.getItem("${LOADER_KEY}")==="1"}d.style.setProperty("--story-vh",b.vh+"px");var calm=w.matchMedia("(prefers-reduced-motion: no-preference)").matches;if(p==="/")b.storyDecided=true;if(p==="/"&&calm&&!/[?&]nostory(=|&|$)/.test(q)&&!(s&&s.getItem("${STORY_KEY}")==="dom")){try{var c=document.createElement("canvas"),g=c.getContext("webgl2",{failIfMajorPerformanceCaveat:true});if(g){var x=g.getExtension("WEBGL_debug_renderer_info"),r=x?String(g.getParameter(x.UNMASKED_RENDERER_WEBGL)):"";if(!/swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i.test(r))b.story="gl";var l=g.getExtension("WEBGL_lose_context");if(l)l.loseContext()}}catch(e){}}var ex=/^\\/(admin|forms|s)(\\/|$)/.test(p);b.loader=!ex&&(/[?&]loader=1(&|$)/.test(q)||!navigator.webdriver)}catch(e){}d.setAttribute("data-story-mode",b.story);d.setAttribute("data-loader",b.loader?"active":"done");if(b.loader&&b.repeat)d.setAttribute("data-loader-fast","");w.__mgmBoot=b;if(b.loader||b.story==="gl"){var v=0,t0=Date.now(),iv=setInterval(function(){var n=Date.now(),st=Math.min(n-t0,500);t0=n;if(w.__mgmLive){clearInterval(iv);return}if(!document.hidden)v+=st;if(v<${BOOT_GIVE_UP_MS})return;clearInterval(iv);b.loader=false;b.story="dom";d.setAttribute("data-loader","done");d.setAttribute("data-story-mode","dom")},250)}})()`;

type BootWindow = Window & { __mgmBoot?: BootState; __mgmLive?: boolean };

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

/** The app is running: the boot script's give-up timer stands down. */
export function markBootLive() {
  (window as BootWindow).__mgmLive = true;
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
  const fast = boot.loader && boot.repeat;
  if (root.hasAttribute("data-loader-fast") !== fast)
    root.toggleAttribute("data-loader-fast", fast);
  if (!root.style.getPropertyValue("--story-vh"))
    root.style.setProperty("--story-vh", `${boot.vh}px`);
}
