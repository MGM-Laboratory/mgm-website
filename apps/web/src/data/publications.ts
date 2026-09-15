import type { CmsPublicationRecord } from "@/lib/publication-cms";

/**
 * Seed publications shown on a fresh database (local or Railway) until the
 * editorial team publishes their own. The entries are real papers from the
 * laboratory's publication list; the bootstrap only runs when the collection
 * is empty, so editing or deleting them through the admin keeps them gone.
 */
export const SEED_PUBLICATIONS: CmsPublicationRecord[] = [
  {
    slug: "location-based-augmented-reality-information-for-bus-route-planning-system",
    publication: {
      slug: "location-based-augmented-reality-information-for-bus-route-planning-system",
      title: "Location-Based Augmented Reality Information for Bus Route Planning System",
      type: "journal-article",
      date: "2015-02-01",
      journal: "International Journal of Electrical and Computer Engineering (IJECE)",
      volume: "5",
      issue: "1",
      pages: "142–149",
      publisher: "Institute of Advanced Engineering and Science (IAES)",
      url: "https://doi.org/10.11591/ijece.v5i1.pp142-149",
      keywords: [
        "Computer science",
        "Planner",
        "Android (operating system)",
        "Augmented reality",
        "Smart phone",
        "Phone",
        "Plan (archaeology)",
        "Android application",
      ],
      abstract:
        "Bus Route Planner applications will unfold their full potential when bus passengers are enabled to get information about the shortest path route, make a travel plan and get the correct buses in order to reduce the travel time. However, all these information are provided in text based and map view. It is difficult to understand them for the person who does not know place in the map. This paper describes the android base application of Augmented Reality (AR) that has feature to support the action of a bus user in an innovative and dynamic ways by putting additional information layer on smart phone camera screen and give the instruction assistant that leading the user way to the nearest bus stop. The experimental results show that, the overall functional of proposed application can be run well in various type of Android smart phone. When compared with similar bus traveling applications, the proposed application works more efficient.",
      authors: [
        {
          id: "a1",
          name: "Komang Candra Brata",
          affiliation: "University of Brawijaya",
          kind: "non-residence",
        },
        {
          id: "a2",
          name: "Deron Liang",
          affiliation: "National Central University",
          kind: "non-residence",
        },
        {
          id: "a3",
          name: "Sholeh Hadi Pramono",
          affiliation: "University of Brawijaya",
          kind: "non-residence",
        },
      ],
      draft: false,
      doi: "10.11591/ijece.v5i1.pp142-149",
      paperKey:
        "static/publications/location-based-augmented-reality-information-for-bus-route-planning-system.pdf",
      paperName:
        "2015_location-based-augmented-reality-information-for-bus-route-planning-system.pdf",
      paperSize: 669289,
    },
  },
  {
    slug: "hanasu-interactive-japanese-language-m-learning-application-to-support-listening",
    publication: {
      slug: "hanasu-interactive-japanese-language-m-learning-application-to-support-listening",
      title:
        "Hanasu: Interactive Japanese language m-learning application to support listening and speaking exercise",
      type: "conference-paper",
      date: "2019",
      draft: false,
      authors: [
        {
          id: "a1",
          name: "Komang Candra Brata",
          kind: "non-residence",
        },
        {
          id: "a2",
          name: "Adam Hendra Brata",
          kind: "non-residence",
        },
        {
          id: "a3",
          name: "Eko Prasetyo Lukman",
          kind: "non-residence",
        },
      ],
      abstract:
        "The Japanese language is not only one of the most favorite foreign languages in Indonesian higher education, but it is also considered a difficult foreign language to learn. This fact creates many mobile learning (m-learning) applications that were developed to help learners learn the Japanese language independently. Existing Japanese m-learning apps concentrate only on improving vocabulary, writing and reading skills. Although improving vocabulary and reading skills are important, practicing Japanese pronunciation is also crucial in fundamental Japanese learning. This study introduces the idea of utilizing the listening and speaking exercise in the M-learning implementation to provide learners with a new experience in term of Japanese language learning method. In addition, this paper also describes preliminary learning outcomes from a small-scale assessment of the learners when they are using the speaking input in m-learning. Evaluation result indicates that the listening and speaking method is feasible for future implementation of m-learning with promising learning outcome enhancement compared to the conventional learning method.",
      pages: "311–315",
      doi: "10.1145/3345120.3345155",
      journal:
        "Proceedings of the 2019 3rd International Conference on Education and Multimedia Technology - ICEMT 2019",
      publisher: "ACM Press",
      url: "http://dl.acm.org/citation.cfm?doid=3345120.3345155",
      keywords: [],
    },
  },
];
