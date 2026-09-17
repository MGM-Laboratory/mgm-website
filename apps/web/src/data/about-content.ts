// The facts here come from MGM Laboratory's own public pages and FILKOM's
// news archive. Told plainly, as a story, not as a spec sheet.

export type StoryBeat = {
  year: string;
  title: string;
  body: string;
  image: string;
};

export const STORY_BEATS: StoryBeat[] = [
  {
    year: "2015",
    title: "It started as a mobile lab",
    body: "Before it was MGM, it was a lab focused on mobile apps at FILKOM, Universitas Brawijaya. A small group of students and lecturers building things for phones, long before that felt like a normal thing for a campus lab to do.",
    image: "/about/story-2015.png",
  },
  {
    year: "2016",
    title: "Our first real launch",
    body: "We shipped Jagoan Indonesia, an iPad app that taught kids about Indonesian culture through games and puzzles. It was a joint project with a team in Japan, and it's still the moment people point to when they ask how this whole thing began.",
    image: "/about/story-2016.png",
  },
  {
    year: "2017 to 2019",
    title: "Figuring out what we're good at",
    body: "We showed off VR labyrinths and local-guide apps at a campus expo. We split into a game team and a mobile team. One of our members flew to Singapore to see how a VR lab there worked. We were still finding our shape.",
    image: "/about/story-2017.png",
  },
  {
    year: "2020 to 2022",
    title: "The name MGM stuck",
    body: "During the pandemic, our head worked on UB Tanggap, a tool the university used to check in on students and staff. Around this time, people started calling us MGM, media, game, and mobile, and it just stayed.",
    image: "/about/story-2020.png",
  },
  {
    year: "Now",
    title: "Four things we care about",
    body: "Today we work across game and new media, websites, mobile apps, and user experience research. Different teams, same lab, same habit of actually shipping the thing instead of just talking about it.",
    image: "/about/story-now.png",
  },
];

export type Faq = {
  question: string;
  answer: string;
};

export const FAQS: Faq[] = [
  {
    question: "What does MGM actually make?",
    answer:
      "Games, XR experiences, mobile apps, and websites, plus the research behind good user experience. If it runs on a screen, someone here has probably built one.",
  },
  {
    question: "Who's actually behind it?",
    answer:
      "Mostly students, working alongside faculty advisors from FILKOM. People rotate in and out as they graduate, so the lab keeps changing while the work keeps going.",
  },
  {
    question: "Can I join?",
    answer:
      "Yes. We open recruitment periodically for student members across every focus area. Check our careers page or just reach out and ask what's open right now.",
  },
  {
    question: "What have you actually built?",
    answer:
      "Real projects, from educational apps to research tools to full products. The projects page has the actual list, with the ones we're proudest of front and center.",
  },
  {
    question: "Where can I find you?",
    answer:
      "Gedung F, FILKOM, Universitas Brawijaya, in Malang. If you're on campus, just ask around, everyone knows where the lab is.",
  },
  {
    question: "How do I get in touch?",
    answer: "Send us a message through the contact page. A real person reads every one.",
  },
];
