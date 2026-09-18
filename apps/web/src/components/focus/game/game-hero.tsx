import { FocusHero } from "../shared/focus-hero";

export function GameHero() {
  return (
    <FocusHero
      eyebrow="Focus — Game & New Media"
      eyebrowClassName="text-brand-green"
      headline={
        <>
          Press start.
          <br />
          Build another world.
        </>
      }
      body="Games, XR, and everything in between — VR, AR, MR, every engine, every console we could get our hands on, and a studio built to actually ship the thing you prototyped."
    />
  );
}
