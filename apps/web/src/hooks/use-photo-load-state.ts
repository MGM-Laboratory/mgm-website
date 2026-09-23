"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

export type PhotoStatus = "loading" | "loaded" | "error";

/**
 * Tracks whether a CMS media photo actually painted, so a skeleton can hold
 * the frame while it loads and initials can take over when it never arrives.
 *
 * The reported status is stored next to the photoKey it was reported for, so
 * swapping the upload reads as "loading" again with no reset effect and no
 * stale "loaded" frame in between.
 *
 * `imageRef` must be the ref of the `<img>` itself. It covers the hydration
 * gap: an image that finished (or failed) before React attached its listeners
 * never fires `onLoad`/`onError`, and without this check those photos would
 * keep their skeleton forever. `complete` with no intrinsic width is a failed
 * load.
 */
export function usePhotoLoadState(
  photoKey: string | undefined,
  imageRef: RefObject<HTMLImageElement | null>,
) {
  const [report, setReport] = useState<{
    photoKey: string;
    status: Exclude<PhotoStatus, "loading">;
  } | null>(null);

  useEffect(() => {
    const node = imageRef.current;
    if (!node || !photoKey || !node.complete) return;
    setReport({ photoKey, status: node.naturalWidth ? "loaded" : "error" });
  }, [imageRef, photoKey]);

  const status: PhotoStatus =
    !photoKey || report?.photoKey !== photoKey ? "loading" : report.status;

  const onLoad = useCallback(() => {
    if (photoKey) setReport({ photoKey, status: "loaded" });
  }, [photoKey]);

  const onError = useCallback(() => {
    if (photoKey) setReport({ photoKey, status: "error" });
  }, [photoKey]);

  return { onError, onLoad, status };
}
