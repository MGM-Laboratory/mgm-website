"use client";

import { Check, X } from "@phosphor-icons/react";
import Cropper, { type Area } from "react-easy-crop";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export type PhotoCropPosition = { x: number; y: number; zoom: number };

/**
 * Crops a square portrait frame out of any image. When the source has an
 * alpha channel the result is encoded as WebP so transparent backgrounds
 * survive; opaque images compress as JPEG.
 */
export async function cropSquarePortrait(source: string, crop: Area): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new window.Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("This image could not be prepared."));
    element.src = source;
  });
  const workingScale = Math.min(1, 1440 / Math.max(crop.width, crop.height));
  const workingCanvas = document.createElement("canvas");
  workingCanvas.width = Math.max(1, Math.round(crop.width * workingScale));
  workingCanvas.height = Math.max(1, Math.round(crop.height * workingScale));
  const workingContext = workingCanvas.getContext("2d");
  if (!workingContext) throw new Error("Your browser could not prepare this image.");
  workingContext.imageSmoothingEnabled = true;
  workingContext.imageSmoothingQuality = "high";
  workingContext.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    workingCanvas.width,
    workingCanvas.height,
  );
  const pixels = workingContext.getImageData(0, 0, workingCanvas.width, workingCanvas.height).data;
  const hasTransparency = pixels.some((_, index) => index % 4 === 3 && pixels[index] < 255);
  const contentType = hasTransparency ? "image/webp" : "image/jpeg";
  const maxBytes = 4 * 1024 * 1024;
  let smallest = "";

  for (const scale of [1, 0.84, 0.7]) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(workingCanvas.width * scale));
    canvas.height = Math.max(1, Math.round(workingCanvas.height * scale));
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(workingCanvas, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.9, 0.82, 0.74]) {
      const encoded = canvas.toDataURL(contentType, quality);
      if (!smallest || encoded.length < smallest.length) smallest = encoded;
      // A base64 data URL adds roughly one third overhead; 4 MiB decoded is
      // safely under the 6 MiB API limit and avoids request-size failures.
      if (Math.ceil((encoded.length - encoded.indexOf(",") - 1) * 0.75) <= maxBytes) {
        return encoded;
      }
    }
  }

  if (smallest) return smallest;
  throw new Error("This image could not be compressed. Please choose another image.");
}

/**
 * Square crop + zoom dialog for author portraits. Drag to reposition, use
 * zoom for the final framing; the confirm callback receives the cropped
 * data URL and the position to store with the record.
 */
export function PhotoCropDialog({
  aspect = 1,
  image,
  onClose,
  onConfirm,
  title = "Frame the portrait",
}: {
  aspect?: number;
  image: string;
  onClose: () => void;
  onConfirm: (photo: string, position: PhotoCropPosition) => void;
  title?: string;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area>();
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isApplying) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isApplying, onClose]);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const apply = async () => {
    if (!croppedAreaPixels) return;
    setIsApplying(true);
    try {
      const photo = await cropSquarePortrait(image, croppedAreaPixels);
      onConfirm(photo, {
        x: crop.x,
        y: crop.y,
        zoom,
      });
    } catch (error) {
      toast.error("Photo could not be prepared", {
        description: error instanceof Error ? error.message : "Please try another image.",
      });
      setIsApplying(false);
    }
  };

  return (
    <div
      aria-modal="true"
      aria-labelledby="photo-crop-title"
      className="fixed inset-0 z-[110] grid place-items-center bg-[#10131b]/70 p-4 backdrop-blur-sm"
      onMouseDown={() => !isApplying && onClose()}
      role="dialog"
    >
      <section
        className="w-full max-w-3xl overflow-hidden rounded-3xl border border-white/15 bg-[#f8f9fc] text-[#171b25] shadow-[0_28px_90px_-30px_rgba(0,0,0,0.7)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-5 border-b border-[#dfe4ee] px-5 py-4 sm:px-7">
          <div>
            <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-brand-blue uppercase">
              Portrait editor
            </p>
            <h2
              className="mt-1 font-display text-2xl font-semibold tracking-[-0.04em]"
              id="photo-crop-title"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-[#687187]">
              Drag to reposition, then use zoom for the final crop. Transparent backgrounds are
              kept.
            </p>
          </div>
          <button
            aria-label="Close photo editor"
            className="rounded-xl p-2 text-[#687187] transition hover:bg-[#e9edf5] hover:text-[#171b25]"
            disabled={isApplying}
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </div>
        <div className="grid gap-6 p-5 sm:grid-cols-[minmax(0,1fr)_12rem] sm:p-7">
          <div className="relative aspect-square min-h-[18rem] overflow-hidden rounded-2xl bg-[#151b27] shadow-inner">
            <Cropper
              aspect={aspect}
              crop={crop}
              cropShape="rect"
              image={image}
              maxZoom={3}
              minZoom={1}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
              restrictPosition
              showGrid={false}
              zoom={zoom}
            />
          </div>
          <div className="flex flex-col justify-between gap-5">
            <div>
              <p className="mb-1.5 block text-[11px] font-bold tracking-[0.08em] text-[#687187] uppercase">
                Zoom
              </p>
              <input
                aria-label="Photo zoom"
                className="h-10 w-full accent-brand-blue"
                max="3"
                min="1"
                onChange={(event) => setZoom(Number(event.target.value))}
                step="0.01"
                type="range"
                value={zoom}
              />
            </div>
            <p className="rounded-2xl bg-brand-blue/[0.07] p-4 text-sm leading-6 text-[#55627a]">
              The public portrait uses a square frame. Transparent PNGs stay transparent — the crop
              is encoded as WebP when alpha is present.
            </p>
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#171b25] px-4 text-sm font-semibold text-white transition hover:bg-brand-blue active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
              disabled={!croppedAreaPixels || isApplying}
              onClick={() => void apply()}
              type="button"
            >
              {isApplying ? "Preparing…" : "Use this photo"}
              <Check size={17} weight="bold" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
