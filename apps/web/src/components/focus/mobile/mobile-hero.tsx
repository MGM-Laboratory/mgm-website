import { FocusHero } from "../shared/focus-hero";

export function MobileHero() {
  return (
    <FocusHero
      eyebrow="Focus — Mobile Development"
      eyebrowClassName="text-brand-red"
      headline={
        <>
          One team.
          <br />
          Every screen in someone&apos;s pocket.
        </>
      }
      body="iOS, Android, tablets, prototypes to store releases — the same full pipeline as our web team, tested on real hardware, not just a simulator window."
    />
  );
}
