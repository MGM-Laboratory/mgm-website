import { Group } from "three";

import { createAtmosphere } from "@/components/articles/world/library/atmosphere";
import { createDrift } from "@/components/articles/world/library/drift";
import { createFloor } from "@/components/articles/world/library/floor";
import { createLanterns } from "@/components/articles/world/library/lanterns";
import { TIER_LAYOUT } from "@/components/articles/world/library/layout";
import {
  createLibraryUniforms,
  type LibraryUniforms,
} from "@/components/articles/world/library/library-glsl";
import { solidMaterial } from "@/components/articles/world/library/materials";
import { createStacks } from "@/components/articles/world/library/stacks";
import { createVault } from "@/components/articles/world/library/vault";
import { createGreatWindow } from "@/components/articles/world/library/window";
import type { QualityTier } from "@/components/articles/world/world-api";
import type { WorldUniforms } from "@/components/articles/world/world-glsl";

/**
 * The forbidden library: a nave of towering white stacks in three storeys,
 * galleries with balustrades, rolling ladders, pointed arches on every pier
 * receding to a great window that pours god rays through thick fog, lanterns
 * hanging on long chains, a river of light flowing along the marble toward
 * the window, and books, pages, dust and (by night) glyphs drifting in the
 * air. By night the same place turns black and ink-blue, moonlit through the
 * window, its lanterns burning as embers.
 *
 * Modelled in library units (layout.ts) inside one group the engine scales
 * with the viewport height, with the walls moved to stand just outside the
 * list's columns (`setNaveHalfWidth`). Everything is instanced or a single
 * mesh: about twenty draw calls in all. Every material reads the shared
 * world uniforms, so the scheme wave and the article theme tint sweep through
 * it like everything else. The layout is deterministic: every visitor walks
 * into the same library.
 */

export type LibraryEnvironment = {
  group: Group;
  uniforms: LibraryUniforms;
  update(time: number, dt: number, scrollSpeed: number): void;
  /** Moves the walls to ±`half` library units from the nave's axis. */
  setNaveHalfWidth(half: number): void;
  /** Thins the library for a weaker device (the quality governor steps down). */
  setTier(tier: QualityTier): void;
  dispose(): void;
};

export function createLibraryEnvironment(
  uniforms: WorldUniforms,
  tier: QualityTier,
): LibraryEnvironment {
  const layout = TIER_LAYOUT[tier];
  const library = createLibraryUniforms();
  const group = new Group();

  const stackMaterial = solidMaterial(uniforms, library, { rim: 1, gloss: 0.04 });
  const stoneMaterial = solidMaterial(uniforms, library, { rim: 0.6 });

  const stacks = createStacks(stackMaterial, { bays: layout.bays, bookMin: layout.bookMin });
  const vault = createVault(stoneMaterial, { bays: layout.bays });
  const windowLight = createGreatWindow(uniforms, library, {
    bays: layout.bays,
    rays: layout.shafts,
  });
  const lanterns = createLanterns(uniforms, library, stoneMaterial, { bays: layout.bays });
  const atmosphere = createAtmosphere(uniforms, library, {
    bays: layout.bays,
    sheets: layout.fogSheets,
  });
  const floor = createFloor(uniforms, library, { bays: layout.bays });
  const drift = createDrift(uniforms, library, stackMaterial, {
    bays: layout.bays,
    pages: layout.pages,
    motes: layout.motes,
    floaters: layout.floaters,
    glyphs: layout.glyphs,
  });

  group.add(
    atmosphere.group,
    floor.mesh,
    stacks.group,
    vault.group,
    windowLight.group,
    lanterns.group,
    drift.group,
  );

  let half = 6;
  let flow = 0;

  const setNaveHalfWidth = (next: number) => {
    half = next;
    library.uNaveHalf.value = next;
    stacks.setNaveHalf(next);
    vault.setNaveHalf(next);
    windowLight.setNaveHalf(next);
    lanterns.setNaveHalf(next);
    atmosphere.setNaveHalf(next);
    floor.setNaveHalf(next);
  };
  setNaveHalfWidth(half);

  return {
    group,
    uniforms: library,
    update(time, dt, scrollSpeed) {
      // The river runs toward the window; scrolling the list speeds it up.
      flow += dt * (0.35 + Math.min(Math.abs(scrollSpeed), 6) * 1.1);
      library.uFlow.value = flow;
      drift.update(time, half);
    },
    setNaveHalfWidth(next) {
      if (Math.abs(next - half) > 1e-3) setNaveHalfWidth(next);
    },
    setTier(next) {
      const limits = TIER_LAYOUT[next];
      drift.setCounts(limits);
      atmosphere.setSheetCount(limits.fogSheets);
      windowLight.setRayCount(limits.shafts);
    },
    dispose() {
      stacks.dispose();
      vault.dispose();
      windowLight.dispose();
      lanterns.dispose();
      atmosphere.dispose();
      floor.dispose();
      drift.dispose();
      stackMaterial.dispose();
      stoneMaterial.dispose();
      group.clear();
    },
  };
}
