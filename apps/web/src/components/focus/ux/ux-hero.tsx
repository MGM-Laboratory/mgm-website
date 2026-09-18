import { FocusHero } from "../shared/focus-hero";

export function UxHero() {
  return (
    <FocusHero
      eyebrow="Focus — HCI / UX"
      eyebrowClassName="text-foreground/60"
      headline={
        <>
          We notice things
          <br />
          you didn&apos;t.
        </>
      }
      body="Eye tracking, heart rate, recorded sessions — every interface we ship starts with watching a real person use it, not a guess about what they'll click."
    />
  );
}
