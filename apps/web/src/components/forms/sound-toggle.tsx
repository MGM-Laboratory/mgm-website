"use client";

import { Volume2, VolumeX } from "lucide-react";

import type { FormCopy } from "@/lib/forms/public-copy";

export function SoundToggle({
  on,
  onToggle,
  copy,
}: {
  on: boolean;
  onToggle: () => void;
  copy: FormCopy;
}) {
  return (
    <button
      type="button"
      className="fx-icon-button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? copy.soundOff : copy.soundOn}
      title={on ? copy.soundOff : copy.soundOn}
    >
      {on ? (
        <Volume2 aria-hidden strokeWidth={2.25} size={18} />
      ) : (
        <VolumeX aria-hidden strokeWidth={2.25} size={18} />
      )}
    </button>
  );
}
