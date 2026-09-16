export type Partner = {
  slug: string;
  name: string;
  logo: string;
  /** Intrinsic pixel size of the source logo file, for aspect-correct sizing. */
  logoWidth: number;
  logoHeight: number;
  /**
   * Real, hedged summary of the relationship. Not currently rendered (the
   * hover affordance is a generic "Click to read the story" tooltip), kept
   * as the sourced research backing each article link.
   */
  blurb?: string;
  /** Slug of the dedicated article at /articles/[slug] covering this relationship. */
  articleSlug?: string;
  /**
   * True only for marks that are near-monochrome dark (black/near-black
   * wordmarks with at most a small colored accent) — CSS-inverting a
   * saturated multi-color logo (a national flag palette, a product mascot)
   * would produce the wrong brand colors, so this is opt-in per logo, not a
   * global filter. Decided by compositing each processed (background-removed)
   * logo on the actual dark-mode background color and inspecting the result.
   */
  invertInDark?: boolean;
  /**
   * Explicit dark-mode asset swap, used instead of `invertInDark` whenever a
   * blanket CSS invert would distort a logo's real brand color. Covers two
   * cases: a genuinely separate light/dark file supplied by the partner
   * (Ritsumeikan), and a generated variant where only the wordmark/tagline
   * text was recolored to white while the mark itself (a crest, a colored
   * icon) was left pixel-for-pixel untouched — done geometrically (the text
   * sits in its own region of the source image) or, for vector sources, by
   * only touching the specific fill(s) known to belong to text paths.
   */
  logoDark?: string;
  /**
   * Per-logo size multiplier applied on top of the shared row height (1 =
   * unchanged). Marks that read visually small or large at the same
   * physical height as everything else — a wordmark with lots of internal
   * whitespace, a very dense crest — get a manual correction here rather
   * than everything sharing one literal pixel height.
   */
  logoScale?: number;
};

// Every logo here is a straight-from-the-source brand mark with its
// background removed (flood-filled from the image edges, so enclosed white
// shapes like Tokopedia's owl eyes survive) and re-encoded to WebP with
// alpha, or a true vector SVG. Logos render in their real colors directly on
// the page background in both themes. Per-theme adjustment is either
// `invertInDark` (a handful of near-black wordmarks, safe to CSS-invert
// wholesale) or `logoDark` (an explicit swapped-in asset, used whenever only
// the text needed to change and the mark itself had to stay untouched).
//
// Order is by public recognizability, most to least, not by importance to
// the lab or research strength. Signal: Wikipedia monthly pageviews summed
// over the trailing 12 months (2026-09), from a verified title match (the
// page's own extract had to mention the entity, not just a fuzzy search
// hit — e.g. a bare search for "fxMedia" resolves to the FX TV channel, a
// bare search for "Saga University" resolves to a random film article).
// tiket.com and Blibli resolve to the same Wikipedia article and therefore
// tie exactly, since the two companies merged and now share one page.
// Entities with no Wikipedia presence sit in an unranked tail, ordered
// alphabetically rather than guessed. Nanyang Technological University and
// Hiroshima University, and Mekari's position next to tiket.com, are
// explicit manual placements requested on top of the pageview ranking.
export const PARTNERS: Partner[] = [
  {
    slug: "hiroshima-university",
    name: "Hiroshima University",
    logo: "/partners/hiroshima-university.webp",
    logoWidth: 400,
    logoHeight: 393,
    blurb:
      "Hiroshima's Learning Engineering Laboratory has run a formal Implementation Agreement on Research Fellowship with Lab MGM since 2024, continuing into 2025 on predictive learning models and the Kit-Build Concept Map.",
    articleSlug: "hiroshima-university-research-fellowship",
    // Wikipedia pageviews (12mo): 8,740 — manually placed first, ahead of its
    // pageview rank, alongside NTU swapping into its slot below.
  },
  {
    slug: "tokopedia",
    name: "Tokopedia",
    logo: "/partners/tokopedia.webp",
    logoWidth: 400,
    logoHeight: 120,
    logoScale: 1.3,
    blurb:
      "Tokopedia's UX designer opened Lab MGM's 2022 Interaction Design guest-lecture series, sharing how product design works inside the company.",
    articleSlug: "tokopedia-interaction-design",
    // Wikipedia pageviews (12mo): 49,656
  },
  {
    slug: "ritsumeikan-university",
    name: "Ritsumeikan University",
    logo: "/partners/ritsumeikan-university.webp",
    logoDark: "/partners/ritsumeikan-university-dark.webp",
    logoWidth: 400,
    logoHeight: 101,
    blurb:
      "A Ritsumeikan doctoral student spoke in the fourth session of Lab MGM's Interaction Design series and has coauthored decision-support research with MGM and UB researchers.",
    articleSlug: "ritsumeikan-university",
    // Wikipedia pageviews (12mo): 25,856. logoDark is the partner's own
    // white-on-transparent lockup, not a generated variant.
  },
  {
    slug: "national-central-university",
    name: "National Central University",
    logo: "/partners/national-central-university.webp",
    logoDark: "/partners/national-central-university-dark.webp",
    logoWidth: 400,
    logoHeight: 84,
    blurb:
      "A long-running research link through Komang Candra Brata and NCU's Deron Liang has produced MGM-listed location-based AR and navigation work since 2015.",
    articleSlug: "national-central-university",
    // Wikipedia pageviews (12mo): 17,100
  },
  {
    slug: "binus",
    name: "BINUS University",
    logo: "/partners/binus.svg",
    logoDark: "/partners/binus-dark.svg",
    logoWidth: 400,
    logoHeight: 240,
    logoScale: 1.3,
    blurb:
      "BINUS School of Computer Science researchers joined Herman Tolle and ITS researchers on MGM-linked human-computer interaction research.",
    articleSlug: "binus-university",
    // Wikipedia pageviews (12mo): 11,414
  },
  {
    slug: "blibli",
    name: "Blibli",
    logo: "/partners/blibli.webp",
    logoWidth: 400,
    logoHeight: 225,
    logoScale: 1.3,
    blurb:
      "Blibli sent two speakers into Lab MGM's 2022 Interaction Design series: a product manager in session two and a UI designer in session three.",
    articleSlug: "blibli-interaction-design",
    // Wikipedia pageviews (12mo): 11,101 (shares its article with tiket.com post-merger)
  },
  {
    slug: "tiket-com",
    name: "tiket.com",
    logo: "/partners/tiket-com.webp",
    logoDark: "/partners/tiket-com-dark.webp",
    logoWidth: 400,
    logoHeight: 87,
    logoScale: 0.85,
    blurb:
      "tiket.com's product designer joined Lab MGM's first 2022 Interaction Design session alongside Tokopedia, discussing the product designer's path.",
    articleSlug: "tiket-com-interaction-design",
    // Wikipedia pageviews (12mo): 11,101 (shares its article with Blibli post-merger)
  },
  {
    slug: "mekari",
    name: "Mekari",
    logo: "/partners/mekari.svg",
    logoDark: "/partners/mekari-dark.svg",
    logoWidth: 695,
    logoHeight: 135,
    logoScale: 0.75,
    blurb:
      "Mekari's UX researcher spoke in the second session of Lab MGM's 2022 Interaction Design webinar series.",
    articleSlug: "mekari-interaction-design",
    // Wikipedia pageviews (12mo): 3,012 — manually placed next to tiket.com
    // rather than by pageview rank.
  },
  {
    slug: "nanyang-technological-university",
    name: "Nanyang Technological University",
    logo: "/partners/nanyang-technological-university.svg",
    logoDark: "/partners/nanyang-technological-university-dark.svg",
    logoWidth: 515,
    logoHeight: 213,
    logoScale: 1.6,
    blurb:
      "Lab MGM's leadership visited NTU's Centre for Augmented and Virtual Reality in 2022 to initiate cooperation on interactive media research, following an earlier NTU visit to Brawijaya in 2019.",
    articleSlug: "nanyang-technological-university-cavr",
    // Wikipedia pageviews (12mo): 90,993 — manually swapped into Hiroshima's
    // slot rather than leading the strip by pageview rank.
  },
  {
    slug: "pens",
    name: "PENS",
    logo: "/partners/pens.webp",
    logoDark: "/partners/pens-dark.webp",
    logoWidth: 391,
    logoHeight: 372,
    blurb:
      "A PENS researcher, Sritrusta Sukaridhoto, coauthored the MGM-registered 2023 ARCore outdoor-navigation study.",
    articleSlug: "pens",
    // Wikipedia pageviews (12mo): 8,222
  },
  {
    slug: "universitas-brawijaya",
    name: "Universitas Brawijaya",
    logo: "/partners/universitas-brawijaya.webp",
    logoWidth: 398,
    logoHeight: 400,
    blurb:
      "Lab MGM's home university, whose IT unit, COVID-19 task force, and Urban and Regional Planning department it joined to build the UB Tanggap COVID-19 application in 2020.",
    articleSlug: "universitas-brawijaya",
    // Wikipedia pageviews (12mo): 7,802
  },
  {
    slug: "okayama-university",
    name: "Okayama University",
    logo: "/partners/okayama-university.svg",
    logoDark: "/partners/okayama-university-dark.svg",
    logoWidth: 400,
    logoHeight: 121,
    blurb:
      "Okayama University researchers have coauthored a recurring 2024 to 2025 line of AR and IoT publications with current MGM personnel.",
    articleSlug: "okayama-university",
    // Wikipedia pageviews (12mo): 6,570
  },
  {
    slug: "kyushu-institute-of-technology",
    name: "Kyushu Institute of Technology",
    logo: "/partners/kyutech.webp",
    logoDark: "/partners/kyutech-dark.webp",
    logoWidth: 400,
    logoHeight: 88,
    logoScale: 0.85,
    blurb:
      "A 2018 guest lecture on assistive technology brought Kyutech's Chikamune Wada to FILKOM alongside the MGM Research Group, part of an ongoing faculty-level Kyutech partnership.",
    articleSlug: "kyushu-institute-of-technology",
    // Wikipedia pageviews (12mo): 4,879
  },
  {
    slug: "saga-university",
    name: "Saga University",
    logo: "/partners/saga-university.webp",
    logoWidth: 400,
    logoHeight: 158,
    blurb:
      "Saga University's Kohei Arai coauthored early MGM e-learning and VR research with Herman Tolle's group from 2014 to 2015.",
    articleSlug: "saga-university",
    invertInDark: true,
    // Wikipedia pageviews (12mo): 2,743
  },
  {
    slug: "universitas-narotama-surabaya",
    name: "Universitas Narotama Surabaya",
    logo: "/partners/universitas-narotama-surabaya.webp",
    logoWidth: 320,
    logoHeight: 320,
    blurb:
      "A 37-person Narotama delegation toured Lab MGM in 2026, exploring its research and outputs as part of inter-university networking with FILKOM.",
    articleSlug: "universitas-narotama-surabaya-visit",
    // Wikipedia pageviews (12mo): 2,670
  },
  {
    slug: "eon-reality",
    name: "EON Reality",
    logo: "/partners/eon-reality.webp",
    logoWidth: 400,
    logoHeight: 123,
    blurb:
      "During the 2022 Singapore cooperation mission, Lab MGM met EON Reality through CAVR and agreed to pursue an MoU toward an AR/VR center of excellence at UB.",
    articleSlug: "eon-reality-singapore",
    invertInDark: true,
    // Wikipedia pageviews (12mo): 2,215
  },
  {
    slug: "mister-aladin",
    name: "Mister Aladin",
    logo: "/partners/mister-aladin.webp",
    logoWidth: 400,
    logoHeight: 267,
    blurb:
      "Mister Aladin's lead UI/UX developer spoke in the third session of Lab MGM's 2022 Interaction Design webinar series.",
    articleSlug: "mister-aladin-interaction-design",
    // Wikipedia pageviews (12mo): 459
  },
  // No verified Wikipedia presence for the remaining seven — ordered
  // alphabetically rather than guessed at a finer grain.
  {
    slug: "biznet-gio",
    name: "Biznet GioCloud",
    logo: "/partners/biznet-gio.webp",
    logoDark: "/partners/biznet-gio-dark.webp",
    logoWidth: 400,
    logoHeight: 180,
    // No dedicated article yet — mark isn't a link, just shown in the strip.
  },
  {
    slug: "bkpsdm-kabupaten-malang",
    name: "BKPSDM Kab. Malang",
    logo: "/partners/bkpsdm.webp",
    logoWidth: 400,
    logoHeight: 182,
    blurb:
      "MGM-linked community-service work developed and deployed a CAT exam system for BKPSDM Kabupaten Malang's own testing laboratory.",
    articleSlug: "bkpsdm-kabupaten-malang-cat",
    invertInDark: true,
  },
  {
    slug: "fxmedia",
    name: "fxMedia",
    logo: "/partners/fxmedia.webp",
    logoWidth: 400,
    logoHeight: 225,
    blurb:
      "Lab MGM's leadership visited this Singapore media company in 2022 to explore collaborative research in AR, VR, and the metaverse.",
    articleSlug: "fxmedia-singapore",
  },
  {
    slug: "indogetjob",
    name: "PT Indogetjob",
    logo: "/partners/indogetjob.webp",
    logoWidth: 400,
    logoHeight: 334,
    blurb:
      "Lab MGM built the Sarjana Sakti mobile job-fair platform, with soft-skills assessment, together with PT Indogetjob International Solution.",
    articleSlug: "indogetjob-sarjana-sakti",
    invertInDark: true,
  },
  {
    slug: "instiki",
    name: "INSTIKI",
    logo: "/partners/instiki.webp",
    logoWidth: 400,
    logoHeight: 142,
    blurb:
      "Researchers affiliated with INSTIKI Bali coauthored the 2025 SEMAR IoT research alongside MGM member Komang Candra Brata and Okayama University collaborators.",
    articleSlug: "instiki",
  },
  {
    slug: "mirai-education",
    name: "Mirai Education",
    logo: "/partners/mirai.webp",
    logoWidth: 384,
    logoHeight: 107,
    blurb:
      "The educational game Jagoan Indonesia, launched from the MGM room in 2016, was produced through FILKOM's cooperation with this Japan-based education company and developed under its guidance.",
    articleSlug: "mirai-education-jagoan-indonesia",
  },
  {
    slug: "rumah-sakit-semen-gresik",
    name: "RS Semen Gresik",
    logo: "/partners/rumah-sakit-semen-gresik.webp",
    logoWidth: 400,
    logoHeight: 400,
    blurb:
      "This Gresik hospital was the study site and interview partner behind MGM's mobile HomeCare user-experience research.",
    articleSlug: "rumah-sakit-semen-gresik",
  },
];
