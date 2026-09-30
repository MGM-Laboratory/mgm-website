import { preloadStory, type StoryPreloadProgress } from "@/components/story/assets/cache";
import { createStoryAssets, disposeStoryLoaders } from "@/components/story/assets/loaders";
import type { StoryTier } from "@/components/story/assets/types";
import type { StoryAct } from "@/components/story/engine/act";
import { StoryDirector, type StoryFallbackReason } from "@/components/story/engine/director";
import { storyLabels } from "@/components/story/engine/labels";
import { StoryOverlayStore } from "@/components/story/engine/overlay-store";
import { StoryPropsImpl } from "@/components/story/engine/props";
import {
  guessStoryTier,
  judgeWarmup,
  levelOf,
  storyTierOverride,
} from "@/components/story/engine/quality";
import { StoryStage } from "@/components/story/engine/stage";
import { ENTRANCE_VH, TIMELINE } from "@/components/story/engine/timeline";

/**
 * The homepage story's engine for the whole visit: the stage, the parsed
 * assets, the props, the four acts and the director, built once (by the
 * loading screen on a capable device, or by the first visit to `/`) and kept
 * at module level, so `/ -> /projects -> /` finds everything parsed and
 * compiled. The story section attaches it while `/` is mounted and detaches
 * it on leave; only a failure (a lost context, a hopeless renderer) tears
 * it down, and the visit then keeps the storybook.
 *
 * Build order: fetch the bytes (progress), create the stage, parse every
 * glTF, init every act (each compiles its programs), render one frame at the
 * middle of every beat so nothing compiles on first sight, then time a few
 * frames of the heaviest act to pick the start tier (or to give up).
 */

export type StoryBuildPhase = "fetch" | "build" | "warm" | "ready";

export type StoryBuildProgress = Readonly<{
  phase: StoryBuildPhase;
  /** 0..1 over the whole build (bytes weigh 80%). */
  fraction: number;
  bytes: StoryPreloadProgress;
}>;

const STORY_KEY = "mgm:story";

async function loadActs(): Promise<StoryAct[]> {
  const [cards, room, worlds, finale] = await Promise.all([
    import("@/components/story/acts/cards"),
    import("@/components/story/acts/room"),
    import("@/components/story/acts/worlds"),
    import("@/components/story/acts/finale"),
  ]);
  return [cards.createAct(), room.createAct(), worlds.createAct(), finale.createAct()];
}

/** Every beat's middle, and the entrance: the warm-up renders each once. */
function warmPositions() {
  const positions = [-ENTRANCE_VH / 2];
  for (const beat of TIMELINE.beats) positions.push(beat.start + beat.vh / 2);
  return positions;
}

/** The busiest place to time: the middle of the longest world. */
function heaviestPosition() {
  const world = TIMELINE.beats
    .filter((beat) => beat.act === "worlds")
    .sort((a, b) => b.vh - a.vh)
    .at(0);
  return world ? world.start + world.vh / 2 : TIMELINE.end / 2;
}

export class StoryEngine {
  private onFallback: ((reason: StoryFallbackReason) => void) | null = null;
  private disposed = false;

  constructor(
    readonly stage: StoryStage,
    readonly director: StoryDirector,
    readonly overlay: StoryOverlayStore,
    private readonly acts: readonly StoryAct[],
    private readonly props: StoryPropsImpl,
  ) {}

  /** The section is on the page: the director takes over. */
  attach(
    section: HTMLElement,
    host: HTMLElement,
    onFallback: (reason: StoryFallbackReason) => void,
  ) {
    if (this.disposed) return;
    this.onFallback = onFallback;
    this.director.attach(section, host);
  }

  detach() {
    this.director.detach();
    this.onFallback = null;
  }

  /** Called by the director (and the stage) when the visit must switch to the storybook. */
  fail(reason: StoryFallbackReason) {
    const notify = this.onFallback;
    discardStoryEngine(reason);
    notify?.(reason);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.director.detach();
    for (const act of this.acts) {
      try {
        act.dispose();
      } catch {
        // An act that fails to clean up must not keep the rest alive.
      }
    }
    this.props.dispose();
    this.stage.dispose();
    disposeStoryLoaders();
  }
}

let engine: StoryEngine | null = null;
let building: Promise<StoryEngine | null> | null = null;
let failed: StoryFallbackReason | null = null;

/** The engine if it is built. */
export function currentStoryEngine() {
  return engine;
}

/** Why the visit fell back to the storybook, if it did. */
export function storyEngineFailure() {
  return failed;
}

/** Tears the engine down for the rest of the visit (and the tab, when the renderer is to blame). */
export function discardStoryEngine(reason: StoryFallbackReason) {
  failed = reason;
  try {
    if (reason !== "failed") window.sessionStorage.setItem(STORY_KEY, "dom");
  } catch {
    // Storage may be unavailable (a private window): the visit still falls back.
  }
  const current = engine;
  engine = null;
  building = null;
  current?.dispose();
}

/**
 * Builds the engine once per visit (concurrent callers share the build).
 * Resolves null when the story cannot run here (a failed build, a context
 * that could not start, a renderer too slow for any tier); never rejects.
 */
export function ensureStoryEngine(
  onProgress?: (progress: StoryBuildProgress) => void,
): Promise<StoryEngine | null> {
  if (engine) {
    onProgress?.({ phase: "ready", fraction: 1, bytes: emptyBytes() });
    return Promise.resolve(engine);
  }
  if (failed) return Promise.resolve(null);
  building ??= build(onProgress).catch(() => {
    discardStoryEngine("failed");
    return null;
  });
  return building;
}

function emptyBytes(): StoryPreloadProgress {
  return { loadedBytes: 0, totalBytes: 0, done: 0, files: 0, failed: [] };
}

async function build(
  onProgress?: (progress: StoryBuildProgress) => void,
): Promise<StoryEngine | null> {
  const tier: StoryTier = storyTierOverride(window.location.search) ?? guessStoryTier();
  let bytes = emptyBytes();
  const report = (phase: StoryBuildPhase, fraction: number) => {
    onProgress?.({ phase, fraction, bytes });
  };
  bytes = await preloadStory(tier, (progress) => {
    bytes = progress;
    const share = progress.totalBytes > 0 ? progress.loadedBytes / progress.totalBytes : 1;
    report("fetch", share * 0.8);
  });
  report("build", 0.82);

  let stage: StoryStage | null = null;
  let ready: StoryEngine | null = null;
  try {
    stage = new StoryStage({
      tier,
      onContextLost: () => {
        if (ready) ready.fail("context-lost");
        else discardStoryEngine("context-lost");
      },
    });
  } catch {
    discardStoryEngine("context-lost");
    return null;
  }
  stage.resize(document.documentElement.clientWidth, window.innerHeight);
  stage.compileSystems();
  const assets = createStoryAssets(stage.renderer, tier);
  await assets.warm();
  const props = new StoryPropsImpl();
  await props.ensure("labels", () => storyLabels);
  const overlay = new StoryOverlayStore();
  const acts = await loadActs();
  const director = new StoryDirector(stage, acts, assets, props, overlay, {
    onFallback: (reason) => {
      if (ready) ready.fail(reason);
    },
  });
  for (const act of acts) await act.init(director.ctx);
  report("warm", 0.9);
  if (stage.isLost()) return null;

  // Every beat once: every program and texture is on the GPU before anyone scrolls.
  for (const t of warmPositions()) director.renderAt(t);
  const gl = stage.renderer.getContext();
  const pixel = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  const heavy = heaviestPosition();
  const verdict = judgeWarmup(tier, () => {
    director.renderAt(heavy);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  });
  director.resetStates();
  if (process.env.NODE_ENV !== "production") {
    console.debug(
      `[story] warm frame ${verdict.frameMs.toFixed(1)} ms, tier ${verdict.tier ?? "none"}`,
    );
  }
  if (verdict.tier === null || stage.isLost()) {
    ready = new StoryEngine(stage, director, overlay, acts, props);
    engine = ready;
    discardStoryEngine("slow");
    return null;
  }
  if (verdict.tier !== tier) stage.setLevel(levelOf(verdict.tier));
  ready = new StoryEngine(stage, director, overlay, acts, props);
  engine = ready;
  report("ready", 1);
  return ready;
}
