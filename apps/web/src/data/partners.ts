export type Partner = {
  slug: string;
  name: string;
  logo: string;
  /** Intrinsic pixel size of the source logo file, for aspect-correct sizing. */
  logoWidth: number;
  logoHeight: number;
  blurb: string;
  /** Slug of the dedicated article at /articles/[slug] covering this relationship. */
  articleSlug: string;
  /**
   * True only for marks that are near-monochrome dark (black/near-black
   * wordmarks with at most a small colored accent) — CSS-inverting a
   * saturated multi-color logo (a national flag palette, a product mascot)
   * would produce the wrong brand colors, so this is opt-in per logo, not a
   * global filter. Decided by compositing each processed (background-removed)
   * logo on the actual dark-mode background color and inspecting the result.
   */
  invertInDark?: boolean;
};

// Every logo here is a straight-from-the-source brand mark with its
// background removed (flood-filled from the image edges, so enclosed white
// shapes like Tokopedia's owl eyes survive) and re-encoded to WebP with
// alpha. Logos render in their real colors directly on the page background
// in both themes; `invertInDark` is the only per-theme adjustment, reserved
// for the handful of marks that are otherwise unreadable on a dark page.
//
// Order is by public recognizability, most to least, not by importance to
// the lab or research strength. Signal: Wikipedia monthly pageviews summed
// over the trailing 12 months (2026-09), from a verified title match (the
// page's own extract had to mention the entity, not just a fuzzy search
// hit — e.g. a bare search for "fxMedia" resolves to the FX TV channel, a
// bare search for "Saga University" resolves to a random film article).
// tiket.com and Blibli resolve to the same Wikipedia article and therefore
// tie exactly, since the two companies merged and now share one page.
// Six entities have no Wikipedia presence at all and sit in an unranked
// tail, ordered alphabetically rather than guessed.
export const PARTNERS: Partner[] = [
  {
    slug: "nanyang-technological-university",
    name: "Nanyang Technological University",
    logo: "/partners/nanyang-technological-university.webp",
    logoWidth: 400,
    logoHeight: 144,
    blurb:
      "Lab MGM's leadership visited NTU's Centre for Augmented and Virtual Reality in 2022 to initiate cooperation on interactive media research, following an earlier NTU visit to Brawijaya in 2019.",
    articleSlug: "nanyang-technological-university-cavr",
    // Wikipedia pageviews (12mo): 90,993
  },
  {
    slug: "tokopedia",
    name: "Tokopedia",
    logo: "/partners/tokopedia.webp",
    logoWidth: 400,
    logoHeight: 120,
    blurb:
      "Tokopedia's UX designer opened Lab MGM's 2022 Interaction Design guest-lecture series, sharing how product design works inside the company.",
    articleSlug: "tokopedia-interaction-design",
    // Wikipedia pageviews (12mo): 49,656
  },
  {
    slug: "ritsumeikan-university",
    name: "Ritsumeikan University",
    logo: "/partners/ritsumeikan-university.webp",
    logoWidth: 400,
    logoHeight: 108,
    blurb:
      "A Ritsumeikan doctoral student spoke in the fourth session of Lab MGM's Interaction Design series and has coauthored decision-support research with MGM and UB researchers.",
    articleSlug: "ritsumeikan-university",
    // Wikipedia pageviews (12mo): 25,856
  },
  {
    slug: "national-central-university",
    name: "National Central University",
    logo: "/partners/national-central-university.webp",
    logoWidth: 400,
    logoHeight: 84,
    blurb:
      "A long-running research link through Komang Candra Brata and NCU's Deron Liang has produced MGM-listed location-based AR and navigation work since 2015.",
    articleSlug: "national-central-university",
    invertInDark: true,
    // Wikipedia pageviews (12mo): 17,100
  },
  {
    slug: "universitas-negeri-malang",
    name: "Universitas Negeri Malang",
    logo: "/partners/universitas-negeri-malang.webp",
    logoWidth: 400,
    logoHeight: 326,
    blurb:
      "A UM researcher with a joint Hiroshima University affiliation has repeatedly coauthored Kit-Build concept-mapping research with MGM personnel.",
    articleSlug: "universitas-negeri-malang",
    // Wikipedia pageviews (12mo): 14,514
  },
  {
    slug: "binus",
    name: "BINUS University",
    logo: "/partners/binus.webp",
    logoWidth: 400,
    logoHeight: 240,
    blurb:
      "BINUS School of Computer Science researchers joined Herman Tolle and ITS researchers on MGM-linked human-computer interaction research.",
    articleSlug: "binus-university",
    invertInDark: true,
    // Wikipedia pageviews (12mo): 11,414
  },
  {
    slug: "blibli",
    name: "Blibli",
    logo: "/partners/blibli.webp",
    logoWidth: 400,
    logoHeight: 225,
    blurb:
      "Blibli sent two speakers into Lab MGM's 2022 Interaction Design series: a product manager in session two and a UI designer in session three.",
    articleSlug: "blibli-interaction-design",
    // Wikipedia pageviews (12mo): 11,101 (shares its article with tiket.com post-merger)
  },
  {
    slug: "tiket-com",
    name: "tiket.com",
    logo: "/partners/tiket-com.webp",
    logoWidth: 400,
    logoHeight: 88,
    blurb:
      "tiket.com's product designer joined Lab MGM's first 2022 Interaction Design session alongside Tokopedia, discussing the product designer's path.",
    articleSlug: "tiket-com-interaction-design",
    // Wikipedia pageviews (12mo): 11,101 (shares its article with Blibli post-merger)
  },
  {
    slug: "national-chung-hsing-university",
    name: "National Chung Hsing University",
    logo: "/partners/national-chung-hsing-university.webp",
    logoWidth: 400,
    logoHeight: 190,
    blurb:
      "NCHU's Chih-Peng Fan coauthored the 2025 rehabilitation exergame study alongside MGM researcher Komang Candra Brata.",
    articleSlug: "national-chung-hsing-university",
    // Wikipedia pageviews (12mo): 10,142
  },
  {
    slug: "institut-teknologi-sepuluh-nopember",
    name: "ITS Surabaya",
    logo: "/partners/its.webp",
    logoWidth: 400,
    logoHeight: 344,
    blurb:
      "An ITS researcher coauthored MGM-linked mobile-shopping-experience research together with Herman Tolle and BINUS researchers.",
    articleSlug: "institut-teknologi-sepuluh-nopember",
    // Wikipedia pageviews (12mo): 9,396
  },
  {
    slug: "hiroshima-university",
    name: "Hiroshima University",
    logo: "/partners/hiroshima-university.webp",
    logoWidth: 400,
    logoHeight: 393,
    blurb:
      "Hiroshima's Learning Engineering Laboratory has run a formal Implementation Agreement on Research Fellowship with Lab MGM since 2024, continuing into 2025 on predictive learning models and the Kit-Build Concept Map.",
    articleSlug: "hiroshima-university-research-fellowship",
    // Wikipedia pageviews (12mo): 8,740
  },
  {
    slug: "pens",
    name: "PENS",
    logo: "/partners/pens.webp",
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
    slug: "politeknik-negeri-malang",
    name: "Politeknik Negeri Malang",
    logo: "/partners/politeknik-negeri-malang.webp",
    logoWidth: 400,
    logoHeight: 400,
    blurb:
      "POLINEMA researchers have repeatedly coauthored MGM-linked research, including 2024 Kit-Build work and a 2025 outdoor location-based AR study.",
    articleSlug: "politeknik-negeri-malang",
    // Wikipedia pageviews (12mo): 7,573
  },
  {
    slug: "okayama-university",
    name: "Okayama University",
    logo: "/partners/okayama-university.webp",
    logoWidth: 400,
    logoHeight: 122,
    blurb:
      "Okayama University researchers have coauthored a recurring 2024 to 2025 line of AR and IoT publications with current MGM personnel.",
    articleSlug: "okayama-university",
    invertInDark: true,
    // Wikipedia pageviews (12mo): 6,570
  },
  {
    slug: "kyushu-institute-of-technology",
    name: "Kyushu Institute of Technology",
    logo: "/partners/kyutech.webp",
    logoWidth: 400,
    logoHeight: 88,
    blurb:
      "A 2018 guest lecture on assistive technology brought Kyutech's Chikamune Wada to FILKOM alongside the MGM Research Group, part of an ongoing faculty-level Kyutech partnership.",
    articleSlug: "kyushu-institute-of-technology",
    invertInDark: true,
    // Wikipedia pageviews (12mo): 4,879
  },
  {
    slug: "universitas-andalas",
    name: "Universitas Andalas",
    logo: "/partners/universitas-andalas.webp",
    logoWidth: 400,
    logoHeight: 400,
    blurb:
      "Students at Universitas Andalas took part in the 2025 MGM-registered rehabilitation exergame study as its research site.",
    articleSlug: "universitas-andalas",
    // Wikipedia pageviews (12mo): 3,850
  },
  {
    slug: "lipi",
    name: "LIPI",
    logo: "/partners/lipi.webp",
    logoWidth: 250,
    logoHeight: 346,
    blurb:
      "LIPI's Machine Learning Research Group collaborated with Herman Tolle under MGM affiliation on earlier published research, before LIPI's functions were later integrated into BRIN.",
    articleSlug: "lipi",
    // Wikipedia pageviews (12mo): 3,062
  },
  {
    slug: "mekari",
    name: "Mekari",
    logo: "/partners/mekari.svg",
    logoWidth: 695,
    logoHeight: 135,
    blurb:
      "Mekari's UX researcher spoke in the second session of Lab MGM's 2022 Interaction Design webinar series.",
    articleSlug: "mekari-interaction-design",
    invertInDark: true,
    // Wikipedia pageviews (12mo): 3,012
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
  // No verified Wikipedia presence for the remaining six — ordered
  // alphabetically rather than guessed at a finer grain.
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
