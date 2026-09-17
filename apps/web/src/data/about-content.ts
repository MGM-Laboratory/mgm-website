import type { Tier } from "@/components/about/cite";

// Everything on /about traces back to the 16 September 2026 evidence review
// of MGM Laboratory's public footprint (FILKOM UB / mgm.ub.ac.id). Nothing
// here is invented — where the record is thin or contradictory, that's
// rendered as-is rather than smoothed over. See src/data/about-sources.ts
// for the literal source register.

export const RESEARCH_CUTOFF = "16 September 2026";

export type Claim = {
  text: string;
  sourceIds: string[];
  tier: Tier;
};

export type QuickFact = Claim & { label: string };

export const QUICK_FACTS: QuickFact[] = [
  {
    label: "Parent institution",
    text: "Fakultas Ilmu Komputer (FILKOM), Universitas Brawijaya, Malang",
    sourceIds: ["S01", "S18"],
    tier: "confirmed",
  },
  {
    label: "Official faculty name",
    text: "Laboratorium Media Game dan Mobile",
    sourceIds: ["S01"],
    tier: "confirmed",
  },
  {
    label: "Own site wording",
    text: "Media, Game, and Mobile Laboratory",
    sourceIds: ["S02", "S03"],
    tier: "confirmed",
  },
  {
    label: "Location",
    text: "Gedung F, FILKOM UB — no current room number publicly confirmed",
    sourceIds: ["S01"],
    tier: "confirmed",
  },
];

export type TimelineEntry = {
  period: string;
  milestone: string;
  meaning: string;
  sourceIds: string[];
  tier: Tier;
};

export const TIMELINE: TimelineEntry[] = [
  {
    period: "2015–2016",
    milestone:
      "The lab's own bibliography lists 2015 mobile, AR, and game work. In May 2016 the MGM research group launched Jagoan Indonesia, an educational iPad app, with Herman Tolle named head of the predecessor Laboratorium Pemrograman Aplikasi Perangkat Bergerak (PAPB).",
    meaning: "A PAPB → MGM lineage is evidenced. No formal renaming decree or date was found.",
    sourceIds: ["S04", "S07", "S06"],
    tier: "historical",
  },
  {
    period: "2017",
    milestone:
      "MGM showed mobile and VR work — a world puzzle, a VR labyrinth, and Jatim Explore — at a UB education expo, and recruited student employees for PHP, Android, iOS, and graphics work.",
    meaning: "Applied output and a student-employee participation model, both documented.",
    sourceIds: ["S08", "S09"],
    tier: "historical",
  },
  {
    period: "2018",
    milestone:
      "The lab described assistive research (HEMOCS head-movement control, the iHelp communication device). Member Aulia Akhrian Syahidi won a Best Paper award at the 5th IEEE ICETAS.",
    meaning: "Broader research scope, plus one clearly documented member-level achievement.",
    sourceIds: ["S10", "S11"],
    tier: "historical",
  },
  {
    period: "2019",
    milestone:
      "Recruitment split into Game & Media and Mobile App squads. Herman Tolle visited CAVR at Nanyang Technological University to discuss AR/VR/MR research.",
    meaning:
      "Specialization by squad, and an exploratory international contact — not an agreement.",
    sourceIds: ["S12", "S13"],
    tier: "historical",
  },
  {
    period: "2020",
    milestone:
      'A Universitas Brawijaya faculty report referred to Herman Tolle as head of "MGM lab" in connection with the UB Tanggap COVID-19 tracking application.',
    meaning: 'First dated use of the "MGM laboratory" name found in the record.',
    sourceIds: ["S14"],
    tier: "historical",
  },
  {
    period: "2022",
    milestone:
      "FILKOM advertised MGM thesis topics. A December report named Aryo Pinandito head of MGM lab and Herman Tolle head of its research group — a split later echoed on MGM's own site.",
    meaning: "A teaching pathway and a lab-head / research-group-head split, both dated.",
    sourceIds: ["S15", "S16"],
    tier: "historical",
  },
  {
    period: "2023–2026",
    milestone:
      "FILKOM cited MGM in supporting game development. The lab's own site now lists seven research areas, a member roster, and a publication bibliography.",
    meaning: "Current visibility and activity — with no audited growth metrics behind it.",
    sourceIds: ["S17", "S02", "S03", "S04"],
    tier: "confirmed",
  },
];

export const GROWTH_INFERENCE: Claim = {
  text: "Growth here means diversification of documented work — from mobile apps and educational games into VR/AR, assistive interfaces, UI/UX, learning media, systems integration, and AI in media — not a quantified claim about staffing, budget, or year-over-year output.",
  sourceIds: ["S07", "S08", "S10", "S12", "S02"],
  tier: "inference",
};

export type ResearchArea = {
  name: string;
  note: string;
  sourceIds: string[];
  tier: Tier;
};

export const RESEARCH_AREAS: ResearchArea[] = [
  {
    name: "AI in media technology",
    note: "Named as a current area on the lab's own research page — no project inventory is published under it.",
    sourceIds: ["S02"],
    tier: "unverified",
  },
  {
    name: "Mobile learning & learning media",
    note: "Jagoan Indonesia is a documented educational game; the bibliography includes further mobile-learning work.",
    sourceIds: ["S02", "S07", "S04"],
    tier: "historical",
  },
  {
    name: "Web & mobile application development",
    note: "2017 hiring specs and the 2019 Mobile App squad show implementation skill demand, historically.",
    sourceIds: ["S02", "S09", "S12"],
    tier: "historical",
  },
  {
    name: "Game development & game AI",
    note: "A named Game & Media squad plus currently listed game specialists support this as an active area.",
    sourceIds: ["S02", "S12", "S03"],
    tier: "confirmed",
  },
  {
    name: "Social crowdsourcing",
    note: "Listed as a research interest — no named project substantiates it in the public record.",
    sourceIds: ["S02"],
    tier: "unverified",
  },
  {
    name: "UI/UX research & design",
    note: "A 2019 UX Designer hiring role and named UI/UX specialists appear on the current site.",
    sourceIds: ["S02", "S12", "S03"],
    tier: "confirmed",
  },
  {
    name: "System integration & API",
    note: "Listed as an interest, with two current members explicitly tagged to it.",
    sourceIds: ["S02", "S03"],
    tier: "confirmed",
  },
];

export type Squad = {
  name: string;
  seeking: string;
  sourceIds: string[];
  tier: Tier;
};

export const SQUADS_2019: Squad[] = [
  {
    name: "Game & Media",
    seeking:
      "Animation designers, video editors, content creators, AR/VR creators, game developers",
    sourceIds: ["S12"],
    tier: "historical",
  },
  {
    name: "Mobile App",
    seeking:
      "UX designers, iOS developers, Android developers, web developers, backend/database engineers",
    sourceIds: ["S12"],
    tier: "historical",
  },
];

export const SQUADS_CAVEAT: Claim = {
  text: "Verified as a January 2019 recruiting structure. Whether these two squads still exist, or whether other divisions have since replaced them, is unverified.",
  sourceIds: ["S12", "S02"],
  tier: "unverified",
};

export type GovernanceClaim = {
  source: string;
  claim: string;
  sourceIds: string[];
};

export const HEADSHIP_CONFLICT: GovernanceClaim[] = [
  {
    source: "FILKOM's public laboratory page",
    claim: 'Agi Putra Kharisma, S.T., M.T. — "Kepala Laboratorium"',
    sourceIds: ["S01"],
  },
  {
    source: "MGM's own members page",
    claim:
      "Ir. Aryo Pinandito, S.T., M.MT., Ph.D. — Head of Laboratory; Agi Putra Kharisma — Vice Head",
    sourceIds: ["S03"],
  },
];

export const HEADSHIP_NOTE: Claim = {
  text: "A December 2022 FILKOM article independently named Aryo head at that time, and MGM's own page separately names Herman Tolle head of the MGM Research Group — a distinct role from lab head. This document doesn't resolve the conflict; a current appointment letter would.",
  sourceIds: ["S16", "S03"],
  tier: "confirmed",
};

export const CORE_MEMBERS: { name: string; focus: string }[] = [
  { name: "Buce Trias Hanggara", focus: "Integration" },
  { name: "Eriq Muhammad Adams Jonemaro", focus: "Game AI & game technology" },
  { name: "Fais Al Huda", focus: "Mobile" },
  { name: "Komang Candra Brata", focus: "UI/UX & mobile" },
  { name: "Lutfi Fanani", focus: "UI/UX, education technology & e-health" },
  { name: "Muhammad Aminul Akbar", focus: "Game & educational technology" },
  { name: "Ratih Kartika Dewi", focus: "Multimedia" },
  { name: "Widhy Hayuhardhika Nugraha Putra", focus: "Integration" },
];

export const CORE_MEMBERS_NOTE: Claim = {
  text: "MGM's own members page lists these eight as lab members with named focus areas. Titles and affiliations reflect a website snapshot, not a verified live roster.",
  sourceIds: ["S03"],
  tier: "confirmed",
};

export const ROSTER_SNAPSHOT: Claim = {
  text: 'The members page separately lists a much broader "Research Group Members" roster of ~28 names — several explicitly marked "Former Members and Current Affiliations" — plus nine master\'s students and thirteen student employees tied to a document labeled March–May 2025. That\'s a dated snapshot, not a live 2026 headcount, and the page\'s undergraduate-student heading is empty.',
  sourceIds: ["S03"],
  tier: "historical",
};

export const HEADCOUNT_UNVERIFIED: Claim = {
  text: "No formal current organizational chart, audited staff count, or division-lead roster is publicly available.",
  sourceIds: ["S03", "S09", "S12"],
  tier: "unverified",
};

export type ProjectEntry = {
  name: string;
  documented: string;
  boundary: string;
  sourceIds: string[];
  tier: Tier;
};

export const PROJECTS: ProjectEntry[] = [
  {
    name: "Jagoan Indonesia",
    documented:
      "Educational iPad app about Indonesian culture, launched May 2016 as a FILKOM–Mirai Education pilot. Jelajah and Puzzle shipped; Kuis was still in development at launch.",
    boundary: "A 2016 launch — not proof of current availability.",
    sourceIds: ["S07"],
    tier: "historical",
  },
  {
    name: "World Puzzle, VR Labyrinth & Jatim Explore",
    documented:
      "Three mobile works shown at a January 2017 UB expo; Jatim Explore supplied local place data with GPS integration.",
    boundary: "Expo demonstrations, not verified commercial products.",
    sourceIds: ["S08"],
    tier: "historical",
  },
  {
    name: "HEMOCS & iHelp",
    documented:
      "Head-movement control and an assistive communication device for people with limited movement or speech, described October 2018.",
    boundary: "Research examples — no current-deployment claim.",
    sourceIds: ["S10"],
    tier: "historical",
  },
  {
    name: "UB Tanggap",
    documented:
      "Cited by a UB faculty report describing an application for tracking community health and location during COVID-19.",
    boundary:
      "A university collaboration; the exact lab deliverable or ownership isn't fully specified.",
    sourceIds: ["S14"],
    tier: "historical",
  },
  {
    name: "Kit-Build Concept Map",
    documented: "Listed on the lab's research page under associated registered rights.",
    boundary: "No registration number supplied.",
    sourceIds: ["S02"],
    tier: "unverified",
  },
  {
    name: "Public Transit@Malang",
    documented: "An Android application listed under associated registered rights.",
    boundary: "No active-service status or registration number supplied.",
    sourceIds: ["S02"],
    tier: "unverified",
  },
];

export const ACHIEVEMENT: Claim = {
  text: "Aulia Akhrian Syahidi won Best Paper at the 5th IEEE ICETAS (Bangkok, 22–23 November 2018) for BandoAR, a smartphone AR + OCR translator from Banjar to Indonesian, supervised by Herman Tolle, Ahmad Afif Supianto, and Kohei Arai. FILKOM explicitly calls him a member of the MGM research group.",
  sourceIds: ["S11"],
  tier: "confirmed",
};

export const ACHIEVEMENT_CAVEAT: Claim = {
  text: "This is a member's individual research award, not an award conferred on the laboratory as an institution — and no exhaustive lab-wide awards ledger is publicly available.",
  sourceIds: ["S11", "S04"],
  tier: "unverified",
};

export type Partner = {
  name: string;
  relationship: string;
  sourceIds: string[];
  tier: Tier;
};

export const PARTNERS: Partner[] = [
  {
    name: "Mirai Education, Japan",
    relationship: "FILKOM called Jagoan Indonesia a pilot collaboration involving MGM researchers.",
    sourceIds: ["S07"],
    tier: "historical",
  },
  {
    name: "CAVR, Nanyang Technological University",
    relationship:
      "MGM's group lead visited CAVR NTU in April 2019 to discuss technology and collaboration — no executed agreement is evidenced.",
    sourceIds: ["S13"],
    tier: "unverified",
  },
  {
    name: "fxMedia Ltd, Singapore",
    relationship: "Discussions in 2022 on AR/VR/metaverse research collaboration.",
    sourceIds: ["S16"],
    tier: "unverified",
  },
  {
    name: "EON Reality",
    relationship: "2022 discussions and an intention to pursue an MoU — execution unverified.",
    sourceIds: ["S16"],
    tier: "unverified",
  },
  {
    name: "BRI (via FILKOM's Game Corner)",
    relationship:
      "FILKOM and BRI collaborated on the faculty's Game Corner, conceptually linked to MGM game development — not verified as an MGM partnership itself.",
    sourceIds: ["S17"],
    tier: "unverified",
  },
  {
    name: "Saga University researchers",
    relationship:
      "Kohei Arai co-supervised the 2018 award-winning work; international co-authors recur in the bibliography.",
    sourceIds: ["S11", "S04"],
    tier: "historical",
  },
];

export type OpenQuestion = {
  question: string;
  answer: string;
  sourceIds: string[];
};

export const OPEN_QUESTIONS: OpenQuestion[] = [
  {
    question: "When exactly was PAPB renamed MGM?",
    answer:
      'A 2016 PAPB/MGM relationship and a 2020 "MGM lab" label are documented. No rename decree or date was found.',
    sourceIds: ["S07", "S14"],
  },
  {
    question: "Who currently heads the lab?",
    answer:
      "FILKOM says Agi. MGM's own site says Aryo, with Agi as vice. Both are reported here rather than resolved.",
    sourceIds: ["S01", "S03"],
  },
  {
    question: "What are the current divisions?",
    answer:
      "Seven research interests are listed; two squads are documented for 2019. No current division chart is public.",
    sourceIds: ["S02", "S12"],
  },
  {
    question: "How many people work here, and how fast has it grown?",
    answer:
      "A mixed roster and dated recruitment posts exist. No comparable annual headcount or audited growth series.",
    sourceIds: ["S03", "S09", "S12"],
  },
  {
    question: "Who are its official active partners?",
    answer:
      "Mirai has a documented pilot. NTU, fxMedia, and EON were exploratory contacts. No complete current contract list.",
    sourceIds: ["S07", "S13", "S16"],
  },
  {
    question: "What are the lab's equipment and access rules?",
    answer:
      "Gedung F and broad activity types are public. The detailed facility and service pages are sealed — see below.",
    sourceIds: ["S01"],
  },
  {
    question: "What awards has the lab won?",
    answer:
      "One documented member Best Paper. Faculty-wide or member wins should not be read as lab-wide awards.",
    sourceIds: ["S11"],
  },
];

export const CLOSING_NOTE: Claim = {
  text: `Before publishing operational or up-to-the-minute claims about MGM, the responsible next step is requesting the current appointment letter, founding and renaming decrees, an approved organizational chart, partner agreements, a facilities inventory, current staff and student lists, annual reports, IP certificates, an awards register, and direct lab contact details — the profile, organization, facilities, service, publications, quality, and contact subpages were password-protected at review (${RESEARCH_CUTOFF}).`,
  sourceIds: ["S20", "S21", "S22", "S23", "S24", "S25", "S26", "S27", "S28"],
  tier: "unverified",
};
