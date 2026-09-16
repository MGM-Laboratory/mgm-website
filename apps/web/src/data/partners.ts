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
};

// Every logo here is a straight-from-the-source brand mark, kept in its
// native colors and never redrawn — see docs/architecture.md for why the
// TrustedBySection renders them on a fixed light plate instead of trying to
// theme each one individually (dark navy marks and gradient wordmarks can't
// survive a CSS invert without losing their real color on hover).
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
  },
  {
    slug: "nanyang-technological-university",
    name: "Nanyang Technological University",
    logo: "/partners/nanyang-technological-university.png",
    logoWidth: 400,
    logoHeight: 144,
    blurb:
      "Lab MGM's leadership visited NTU's Centre for Augmented and Virtual Reality in 2022 to initiate cooperation on interactive media research, following an earlier NTU visit to Brawijaya in 2019.",
    articleSlug: "nanyang-technological-university-cavr",
  },
  {
    slug: "fxmedia",
    name: "fxMedia",
    logo: "/partners/fxmedia.png",
    logoWidth: 400,
    logoHeight: 225,
    blurb:
      "Lab MGM's leadership visited this Singapore media company in 2022 to explore collaborative research in AR, VR, and the metaverse.",
    articleSlug: "fxmedia-singapore",
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
    slug: "indogetjob",
    name: "PT Indogetjob",
    logo: "/partners/indogetjob.png",
    logoWidth: 400,
    logoHeight: 334,
    blurb:
      "Lab MGM built the Sarjana Sakti mobile job-fair platform, with soft-skills assessment, together with PT Indogetjob International Solution.",
    articleSlug: "indogetjob-sarjana-sakti",
  },
  {
    slug: "bkpsdm-kabupaten-malang",
    name: "BKPSDM Kab. Malang",
    logo: "/partners/bkpsdm.png",
    logoWidth: 400,
    logoHeight: 182,
    blurb:
      "MGM-linked community-service work developed and deployed a CAT exam system for BKPSDM Kabupaten Malang's own testing laboratory.",
    articleSlug: "bkpsdm-kabupaten-malang-cat",
  },
  {
    slug: "kyushu-institute-of-technology",
    name: "Kyushu Institute of Technology",
    logo: "/partners/kyutech.png",
    logoWidth: 400,
    logoHeight: 88,
    blurb:
      "A 2018 guest lecture on assistive technology brought Kyutech's Chikamune Wada to FILKOM alongside the MGM Research Group, part of an ongoing faculty-level Kyutech partnership.",
    articleSlug: "kyushu-institute-of-technology",
  },
  {
    slug: "universitas-narotama-surabaya",
    name: "Universitas Narotama Surabaya",
    logo: "/partners/universitas-narotama-surabaya.png",
    logoWidth: 320,
    logoHeight: 320,
    blurb:
      "A 37-person Narotama delegation toured Lab MGM in 2026, exploring its research and outputs as part of inter-university networking with FILKOM.",
    articleSlug: "universitas-narotama-surabaya-visit",
  },
  {
    slug: "tokopedia",
    name: "Tokopedia",
    logo: "/partners/tokopedia.png",
    logoWidth: 400,
    logoHeight: 120,
    blurb:
      "Tokopedia's UX designer opened Lab MGM's 2022 Interaction Design guest-lecture series, sharing how product design works inside the company.",
    articleSlug: "tokopedia-interaction-design",
  },
  {
    slug: "tiket-com",
    name: "tiket.com",
    logo: "/partners/tiket-com.png",
    logoWidth: 400,
    logoHeight: 88,
    blurb:
      "tiket.com's product designer joined Lab MGM's first 2022 Interaction Design session alongside Tokopedia, discussing the product designer's path.",
    articleSlug: "tiket-com-interaction-design",
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
  },
  {
    slug: "ritsumeikan-university",
    name: "Ritsumeikan University",
    logo: "/partners/ritsumeikan-university.png",
    logoWidth: 400,
    logoHeight: 108,
    blurb:
      "A Ritsumeikan doctoral student spoke in the fourth session of Lab MGM's Interaction Design series and has coauthored decision-support research with MGM and UB researchers.",
    articleSlug: "ritsumeikan-university",
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
  },
  {
    slug: "instiki",
    name: "INSTIKI",
    logo: "/partners/instiki.png",
    logoWidth: 400,
    logoHeight: 142,
    blurb:
      "Researchers affiliated with INSTIKI Bali coauthored the 2025 SEMAR IoT research alongside MGM member Komang Candra Brata and Okayama University collaborators.",
    articleSlug: "instiki",
  },
  {
    slug: "institut-teknologi-sepuluh-nopember",
    name: "ITS Surabaya",
    logo: "/partners/its.png",
    logoWidth: 400,
    logoHeight: 344,
    blurb:
      "An ITS researcher coauthored MGM-linked mobile-shopping-experience research together with Herman Tolle and BINUS researchers.",
    articleSlug: "institut-teknologi-sepuluh-nopember",
  },
  {
    slug: "national-central-university",
    name: "National Central University",
    logo: "/partners/national-central-university.png",
    logoWidth: 400,
    logoHeight: 84,
    blurb:
      "A long-running research link through Komang Candra Brata and NCU's Deron Liang has produced MGM-listed location-based AR and navigation work since 2015.",
    articleSlug: "national-central-university",
  },
  {
    slug: "saga-university",
    name: "Saga University",
    logo: "/partners/saga-university.png",
    logoWidth: 400,
    logoHeight: 158,
    blurb:
      "Saga University's Kohei Arai coauthored early MGM e-learning and VR research with Herman Tolle's group from 2014 to 2015.",
    articleSlug: "saga-university",
  },
  {
    slug: "pens",
    name: "PENS",
    logo: "/partners/pens.png",
    logoWidth: 391,
    logoHeight: 372,
    blurb:
      "A PENS researcher, Sritrusta Sukaridhoto, coauthored the MGM-registered 2023 ARCore outdoor-navigation study.",
    articleSlug: "pens",
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
  {
    slug: "universitas-andalas",
    name: "Universitas Andalas",
    logo: "/partners/universitas-andalas.webp",
    logoWidth: 400,
    logoHeight: 400,
    blurb:
      "Students at Universitas Andalas took part in the 2025 MGM-registered rehabilitation exergame study as its research site.",
    articleSlug: "universitas-andalas",
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
  },
  {
    slug: "national-chung-hsing-university",
    name: "National Chung Hsing University",
    logo: "/partners/national-chung-hsing-university.png",
    logoWidth: 400,
    logoHeight: 190,
    blurb:
      "NCHU's Chih-Peng Fan coauthored the 2025 rehabilitation exergame study alongside MGM researcher Komang Candra Brata.",
    articleSlug: "national-chung-hsing-university",
  },
];
