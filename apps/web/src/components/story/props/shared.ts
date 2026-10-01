import type { Texture } from "three";

import type { StoryContext } from "@/components/story/engine/act";

import { loadCards, type CardKit } from "./card-mesh";
import { loadDeckBox, type DeckBox } from "./deck-box";
import { loadGodette, type Godette } from "./godette";
import { loadRoom, type StoryRoom } from "./room";

/**
 * The props more than one act uses, built once per visit through the
 * stage's prop registry so every act gets the same object: the room (the
 * deck's fall reveals it, the table act lives in it), the card kit and the
 * box (the deck act deals from it, the table act lands it), Godette (the
 * table, the worlds and the finale), and the TV feed (the worlds act draws
 * its wormhole into a texture the table act puts on the screen, so the
 * dive through the TV cuts on the same picture).
 *
 * Whoever owns the current beat places a shared prop and owns its parent;
 * nobody keeps a setting from a beat it has left (the stage resets the
 * scene, post and backdrop every frame, and acts set what their beat needs).
 */

/** A live picture for the TV screen, drawn by the worlds act. */
export interface StoryTvFeed {
  /** The picture, in the screen's UV space (upright with `flipY` as the texture says). */
  readonly texture: Texture;
  /** Draws the next frame of the feed; the table act calls it while the screen is on. */
  update(ctx: StoryContext, dt: number): void;
}

declare module "@/components/story/engine/act" {
  interface StoryPropMap {
    room: StoryRoom;
    cardKit: CardKit;
    deckBox: DeckBox;
    godette: Godette;
    tvFeed: StoryTvFeed;
  }
}

export function ensureRoom(ctx: StoryContext) {
  return ctx.props.ensure("room", () => loadRoom(ctx.assets, ctx.tier));
}

export function ensureCardKit(ctx: StoryContext) {
  return ctx.props.ensure("cardKit", () => loadCards(ctx.assets, ctx.tier));
}

export function ensureDeckBox(ctx: StoryContext) {
  return ctx.props.ensure("deckBox", async () =>
    loadDeckBox(ctx.assets, { tier: ctx.tier, cards: await ensureCardKit(ctx) }),
  );
}

/** Godette with all three clip groups (room, flight, finale). */
export function ensureGodette(ctx: StoryContext) {
  return ctx.props.ensure("godette", () => loadGodette(ctx.assets, { tier: ctx.tier }));
}

/** The worlds act's TV feed, once it has registered one (the table act falls back to its own picture). */
export function tvFeed(ctx: StoryContext) {
  return ctx.props.get("tvFeed");
}
