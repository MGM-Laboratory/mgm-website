import type { Metadata } from "next";

import { PageBand } from "@/components/sections/page-band";

export const metadata: Metadata = {
  title: "Game & XR — MGM Laboratory",
  description: "Games, XR, and interactive experiences from MGM Laboratory.",
};

export default function GamePage() {
  return (
    <PageBand
      eyebrow="Focus — Game & XR"
      title="Game & XR"
      description="Games, XR, and interactive experiences built for research, play, and everything in between — from early prototypes to installations."
      tone="green"
      motif="domes"
    />
  );
}
