import { setFlowYield } from "@/components/cursor-distortion/flow-controller";

/**
 * The story's side of the cursor flow's yield: while the story section
 * covers the top of the viewport (from `t = 0` until the section has
 * scrolled away), the flow behind it has nothing left to show, so it stops
 * drawing. It keeps its host and markers, and comes back with a frame
 * already drawn in the same tick the story stops covering the page, so the
 * reel above never blanks.
 */

const OWNER = "homepage-story";

export class StoryFlowYield {
  private on = false;

  /** `covering`: the section's top is at or above the viewport top and its bottom below it. */
  update(covering: boolean) {
    if (covering === this.on) return;
    this.on = covering;
    setFlowYield(OWNER, covering);
  }

  release() {
    this.update(false);
  }
}
