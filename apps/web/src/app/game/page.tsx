import type { Metadata } from "next";

import { GameFocusPage } from "@/components/focus/game/game-focus-page";
import { COMPETENCIES } from "@/data/competencies";

const competency = COMPETENCIES.find((c) => c.href === "/game")!;

export const metadata: Metadata = {
  title: `${competency.title} — MGM Laboratory`,
  description: competency.description,
};

export default function GamePage() {
  return <GameFocusPage />;
}
