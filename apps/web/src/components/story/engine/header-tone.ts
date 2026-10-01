import {
  registerHeaderToneProvider,
  requestHeaderToneSample,
  type HeaderToneProvider,
  type HeaderToneSample,
} from "@/lib/header-tone";
import type { StoryRect } from "@/components/story/engine/act";

/**
 * The glass header's ink over the story. The header's DOM probe skips
 * canvases, so over the WebGL story it would read the transparent section
 * and fall through to the page colour, which is wrong over the dark room
 * or a world. The active act says what is behind the header each frame
 * (`ctx.setHeaderTone`), and this provider answers for the points over the
 * story section with that tone; elsewhere (and with no tone) the DOM probe
 * decides as usual.
 */

const DARK: HeaderToneSample = { color: [21, 24, 30], media: true };
const LIGHT: HeaderToneSample = { color: [247, 247, 245], media: true };

export type StoryTone = "light" | "dark" | null;

export class StoryHeaderTone {
  private tone: StoryTone = null;
  private next: StoryTone = null;
  private rect: StoryRect | null = null;
  private off: (() => void) | null = null;

  attach() {
    this.detach();
    const provider: HeaderToneProvider = (zones) => {
      const tone = this.tone;
      const rect = this.rect;
      if (!tone || !rect) return undefined;
      const sample = tone === "dark" ? DARK : LIGHT;
      return zones.map((zone) =>
        zone.points.map((point) =>
          point.y >= rect.y && point.y <= rect.y + rect.height ? sample : undefined,
        ),
      );
    };
    this.off = registerHeaderToneProvider(provider);
  }

  detach() {
    this.off?.();
    this.off = null;
    if (this.tone !== null) {
      this.tone = null;
      requestHeaderToneSample();
    }
  }

  /** The tone for this frame (the act calls it through the context). */
  set(tone: StoryTone) {
    this.next = tone;
  }

  /** Every frame, before the acts update. */
  beginFrame() {
    this.next = null;
  }

  /** After the acts: publishes a changed tone, over the section's viewport rect. */
  commit(section: StoryRect) {
    this.rect = section;
    if (this.next === this.tone) return;
    this.tone = this.next;
    requestHeaderToneSample();
  }

  get current() {
    return this.tone;
  }
}
