import type { ArticleBlock, CmsArticleRecord } from "@/lib/article-cms";

/**
 * Seed articles shown on a fresh database (local or Railway) until the
 * editorial team publishes real ones. Every entry is editable through the
 * admin workspace — the bootstrap only runs when the articles collection is
 * empty, so publishing or deleting any of these keeps them gone.
 */

function p(text: string): ArticleBlock["content"] {
  return [{ type: "text", text, styles: {} }];
}

function para(id: string, text: string): ArticleBlock {
  return { id, type: "paragraph", content: p(text) };
}

function heading(id: string, level: 1 | 2 | 3, text: string): ArticleBlock {
  return { id, type: "heading", props: { level }, content: p(text) };
}

const cover = (file: string) => `static/article-covers/${file}`;

export const SEED_ARTICLES: CmsArticleRecord[] = [
  {
    slug: "designing-touch-first-research-tools",
    article: {
      slug: "designing-touch-first-research-tools",
      title: "Designing Touch-First Research Tools",
      subtitle: "How one usability study reshaped the way we prototype for field work",
      date: "2024-08-31",
      categories: ["RnD UX", "Case Study"],
      authorSlugs: ["muhammad-gilang-hafizh", "kania-khalifa-kurniadi"],
      draft: false,
      coverKey: cover("touch-first.png"),
    },
    content: [
      para(
        "a1",
        "Researchers in the field rarely sit at a desk. Notes are taken on phones, data is captured between conversations, and prototypes are tested in hallways. Yet most research tooling still assumes a keyboard, a large screen, and an uninterrupted hour. That mismatch is where this project started.",
      ),
      heading("a2", 2, "Starting from the hallway, not the lab"),
      para(
        "a3",
        "We shadowed three student research groups through two full cycles of data collection. The pattern was consistent: participants switched between a notebook, a messaging app, and a spreadsheet at least once every few minutes. Every switch was a chance to lose a thought — or worse, a timestamp.",
      ),
      para(
        "a4",
        "From those sessions we extracted four constraints that drove the rest of the design work: one-handed input, offline-first storage, reviewable capture, and a way to continue work started on a phone from a larger screen later.",
      ),
      {
        id: "a5",
        type: "bulletListItem",
        content: p("One-handed input for standing or walking contexts."),
      },
      {
        id: "a6",
        type: "bulletListItem",
        content: p("Offline-first capture that syncs when a connection returns."),
      },
      {
        id: "a7",
        type: "bulletListItem",
        content: p("Reviewable capture, so every entry carries a clear timestamp and source."),
      },
      heading("a8", 2, "The prototype"),
      para(
        "a9",
        "The first prototype was deliberately crude: a single screen with one large capture button and a stream of timestamped entries. We tested it with eight participants over two weeks. The large button survived every iteration. Everything around it changed at least twice.",
      ),
      {
        id: "a10",
        type: "image",
        props: {
          url: "/article-covers/touch-first.png",
          caption: "The capture-first prototype during hallway testing.",
        },
      },
      para(
        "a11",
        "One finding stood out: participants did not want to classify their own notes. Asking them to tag an entry as an interview, an observation, or an idea broke their flow. Instead, we moved classification to the review stage, where a teammate could tidy the stream at the end of the day.",
      ),
      heading("a12", 2, "What we would do differently"),
      para(
        "a13",
        "The biggest lesson was about feedback loops. Because we tested in the same hallways where the tool would be used, small interaction problems surfaced within minutes instead of days. We plan to keep that pattern: prototype in the field, and let the field decide what survives.",
      ),
    ],
  },
  {
    slug: "shipping-a-mobile-prototype-in-a-week",
    article: {
      slug: "shipping-a-mobile-prototype-in-a-week",
      title: "Shipping a Mobile Prototype in a Week",
      subtitle: "",
      date: "2024-09-07",
      categories: ["Mobile"],
      authorSlugs: ["muhammad-naufal-mathara-rahman"],
      draft: false,
    },
    content: [
      para(
        "b1",
        "A week is a strange unit of time for software. Long enough to build something real, short enough that every decision counts twice. This is the process the mobile division used to go from brief to installable prototype in five working days.",
      ),
      heading("b2", 2, "Day one is for cutting scope"),
      para(
        "b3",
        "The brief asked for a campus event companion: schedules, maps, and a feedback form. On day one we cut the map. A static campus map with a highlighted venue answered 90% of the questions at 10% of the cost.",
      ),
      heading("b4", 2, "Days two to four are for building"),
      para(
        "b5",
        "We kept a single shared component file, one state-management pattern, and a nightly build shared with the wider lab. Feedback from the nightly build shaped the next morning's work.",
      ),
      heading("b6", 2, "Day five is for the honest demo"),
      para(
        "b7",
        "The prototype shipped on time because we treated the demo as the product: real data, real navigation, and a feedback form that actually delivered responses. A prototype that works end to end teaches more than a polished screen that does not.",
      ),
    ],
  },
  {
    slug: "what-makes-an-interface-feel-alive",
    article: {
      slug: "what-makes-an-interface-feel-alive",
      title: "What Makes an Interface Feel Alive",
      subtitle: "Micro-interactions are not decoration — they are how an interface explains itself",
      date: "2024-09-14",
      categories: ["Web", "Case Study"],
      authorSlugs: ["alfredo-radhinal-mukhtar"],
      draft: false,
      coverKey: cover("interface-alive.png"),
    },
    content: [
      para(
        "c1",
        "The difference between an interface that feels mechanical and one that feels alive is rarely visible in a screenshot. It lives in the hundred milliseconds between cause and effect — the way a card settles after being dragged, or how a menu knows where it came from.",
      ),
      heading("c2", 2, "Motion explains causality"),
      para(
        "c3",
        "When an element changes state instantly, the interface leaves the user to reconstruct what happened. A short transition turns an effect into a story: this card moved because you moved it. The link between action and result is the animation itself.",
      ),
      heading("c4", 2, "Restraint is part of the craft"),
      para(
        "c5",
        "Not every change deserves motion. We set three rules on recent web work: transitions under 200 milliseconds, one motion at a time, and never animate something the user is about to read. Motion should resolve, not demand attention.",
      ),
      heading("c6", 2, "Designing for reduced motion"),
      para(
        "c7",
        "Every animated surface in our work ships with a reduced-motion path. The information hierarchy must survive with motion turned off entirely — if the meaning depends on the animation, the design is incomplete.",
      ),
    ],
  },
  {
    slug: "notes-from-our-latest-usability-study",
    article: {
      slug: "notes-from-our-latest-usability-study",
      title: "Notes from Our Latest Usability Study",
      subtitle: "",
      date: "2024-09-21",
      categories: ["RnD UX"],
      authorSlugs: ["kania-khalifa-kurniadi"],
      draft: false,
    },
    content: [
      para(
        "d1",
        "Every usability study surprises us in at least one place. This quarter it was the consent flow: participants read it far more carefully than we expected, and their questions about data handling changed how we present our research toolkit.",
      ),
      heading("d2", 2, "What participants actually noticed"),
      para(
        "d3",
        "We ran six moderated sessions and twelve unmoderated ones across two weeks. The most commented-on element was not the new dashboard — it was the plain-language summary of what data we collect and why. Trust was a feature the participants located before they located any other feature.",
      ),
      heading("d4", 2, "Three changes we shipped immediately"),
      {
        id: "d5",
        type: "numberedListItem",
        content: p("A consent summary written at an eighth-grade reading level."),
      },
      {
        id: "d6",
        type: "numberedListItem",
        content: p("Inline explanations wherever a technical term first appears."),
      },
      {
        id: "d7",
        type: "numberedListItem",
        content: p("A visible, one-tap way to withdraw from a running session."),
      },
      para(
        "d8",
        "None of these changes were glamorous. All of them came directly from watching people hesitate. When the design answers a question before it is asked, the study has done its job.",
      ),
    ],
  },
];
