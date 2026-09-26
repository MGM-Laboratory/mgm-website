import type { ReelPlayerClosed, ReelPlayerRequest } from "@/lib/reel-player";

/**
 * One opening of the reel player, from the click that asked for it to the
 * moment it has fully closed. The host creates it synchronously inside the
 * click (so the video may start with sound), the lazily loaded player UI
 * adopts it, and the host ends it exactly once.
 */
export type PlayerSession = {
  id: number;
  request: ReelPlayerRequest;
  /** The video element, already playing (or asked to) when the UI mounts. */
  video: HTMLVideoElement;
  /** The body-level container everything of this session renders into. */
  shell: HTMLDivElement;
  /** The result of the `play()` call made inside the click, if one was made. */
  playAttempt: Promise<void> | null;
  /** Where playback was asked to start, in seconds. */
  startTime: number;
  /** The player was opened from the keyboard (no pointer to spawn the cursor at). */
  fromKeyboard: boolean;
  /** Where the pointer was when the player was asked for, viewport px. */
  pointerAt: { x: number; y: number } | null;
  /** The page had to be covered before the UI arrived: open without the iris. */
  coveredEarly: boolean;
};

export type PlayerResult = ReelPlayerClosed & {
  /** Seconds actually watched in the player (seeks don't count). */
  watched: number;
};

export type PlayerUiProps = {
  session: PlayerSession;
  /** Called once the close transition has finished (or been cut short). */
  onDone: (result: PlayerResult) => void;
};
