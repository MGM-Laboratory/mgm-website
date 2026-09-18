import { FocusHero } from "../shared/focus-hero";

export function WebsiteHero() {
  return (
    <FocusHero
      eyebrow="Focus — Website Development"
      eyebrowClassName="text-brand-blue"
      headline={
        <>
          You dream it.
          <br />
          We ship it.
        </>
      }
      body="Static sites, product apps, SaaS platforms, open source — every kind of build a browser can run, shipped end to end, with a dedicated infra team making sure it actually stays up."
    />
  );
}
