"use client";

import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { RotateCcw, SkipForward } from "lucide-react";

import type { StoryOverlayStore } from "@/components/story/engine/overlay-store";
import { cn } from "@/lib/utils";
import { STORY_CONTROLS } from "@/data/story";

/**
 * The fixed DOM layer over the WebGL story (`div[data-story-overlay]`,
 * z-index 20: above the page, under the menu and the header). Pointer
 * events pass through it except on its controls. It holds:
 * - the hint line and the HUD caption the acts set each frame,
 * - "Skip the story" (bottom left, while the story covers the screen),
 *   which becomes "Watch again" in the finale,
 * - the hotspots: real links and buttons placed over GL objects, for focus
 *   rings, keyboard and screen readers,
 * - the dev HUD (`?storydebug`, development builds only).
 *
 * It mounts just before `#smooth-wrapper`, outside the transformed page (a
 * fixed box inside it would scroll away), and early in the tab order.
 */

/** The overlay's own root (only ever rendered on the client, once the engine runs). */
function useOverlayRoot() {
  const [root] = useState(() => {
    const element = document.createElement("div");
    element.dataset.storyOverlayRoot = "";
    return element;
  });
  useLayoutEffect(() => {
    const wrapper = document.getElementById("smooth-wrapper");
    if (wrapper?.parentElement) wrapper.before(root);
    else document.body.append(root);
    return () => {
      root.remove();
    };
  }, [root]);
  return root;
}

export function StoryOverlay({ store }: Readonly<{ store: StoryOverlayStore }>) {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const root = useOverlayRoot();
  const dark = snapshot.tone === "dark";
  const skip = snapshot.skip;

  return createPortal(
    <div
      data-story-overlay
      data-tone={snapshot.tone}
      className="pointer-events-none fixed inset-0 z-20"
    >
      <p
        aria-live="polite"
        className={cn(
          "absolute top-[5.25rem] left-6 font-mono text-[0.72rem] tracking-[0.16em] uppercase transition-opacity duration-500 sm:left-10",
          dark ? "text-white/80" : "text-foreground/70",
          snapshot.hud ? "opacity-100" : "opacity-0",
        )}
      >
        {snapshot.hud ?? ""}
      </p>

      <p
        aria-live="polite"
        className={cn(
          "absolute inset-x-6 bottom-[5.5rem] text-center text-sm tracking-tight transition-opacity duration-500 sm:bottom-10",
          dark ? "text-white/85" : "text-foreground/70",
          snapshot.hint ? "opacity-100" : "opacity-0",
        )}
      >
        {snapshot.hint ?? ""}
      </p>

      {skip ? (
        <button
          type="button"
          onClick={() => {
            store.onSkip(skip);
          }}
          className={cn(
            "pointer-events-auto absolute bottom-6 left-6 inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium backdrop-blur-md transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] sm:left-10",
            dark
              ? "border-white/25 bg-black/30 text-white hover:bg-black/45"
              : "border-foreground/15 bg-background/70 text-foreground hover:bg-background/90",
          )}
        >
          {skip === "skip" ? (
            <SkipForward aria-hidden className="size-4" />
          ) : (
            <RotateCcw aria-hidden className="size-4" />
          )}
          {skip === "skip" ? STORY_CONTROLS.skip : STORY_CONTROLS.replay}
        </button>
      ) : null}

      {snapshot.hotspots.map((spot) => {
        const common = {
          "aria-label": spot.label,
          title: spot.label,
          className:
            "story-hotspot pointer-events-auto absolute top-0 left-0 rounded-[0.9rem] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)]",
          onPointerEnter: () => {
            store.hotspotState(spot.id, { hovered: true });
          },
          onPointerLeave: () => {
            store.hotspotState(spot.id, { hovered: false });
          },
          onFocus: () => {
            store.hotspotState(spot.id, { focused: true });
          },
          onBlur: () => {
            store.hotspotState(spot.id, { focused: false });
          },
        };
        return spot.href ? (
          <Link key={spot.id} href={spot.href} ref={store.refFor(spot.id)} {...common} />
        ) : (
          <button
            key={spot.id}
            type="button"
            ref={store.refFor(spot.id)}
            onClick={() => {
              store.activate(spot.id);
            }}
            {...common}
          />
        );
      })}

      {snapshot.debug ? (
        <pre
          ref={(element) => {
            store.setDebugElement(element);
          }}
          className="absolute top-[5.25rem] right-4 rounded-lg bg-black/70 px-3 py-2 font-mono text-[11px] leading-[1.45] text-white"
        />
      ) : null}
    </div>,
    root,
  );
}
