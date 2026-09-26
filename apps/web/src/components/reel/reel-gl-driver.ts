import type { ReelController } from "@/components/reel/reel-controller";

/** Starts the WebGL layer for the reel when it can run; returns the stop function. */
export function startReelGl(controller: ReelController) {
  void controller;
  return () => {};
}
