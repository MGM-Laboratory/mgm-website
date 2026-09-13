export type MemberDivision =
  | "Professors"
  | "Website"
  | "Mobile"
  | "HCI/UX"
  | "Game & XR"
  | "IT & Infrastructure"
  | "Public Relations"
  | "Media"
  | "Curriculum"
  | "Human Resource";

export type MemberAccent = "blue" | "yellow" | "red" | "green";

export type Member = {
  accent: MemberAccent;
  bio: string;
  division: MemberDivision;
  group: "Research and Development" | "Operations" | "People" | "Professors";
  hasPortrait: boolean;
  labFocus: readonly string[];
  name: string;
  nickname?: string;
  role: "Student Member" | "Professor";
  slug: string;
  unit?: "Assistant Coordinator" | "Secretariat";
};

type DivisionConfig = Pick<Member, "division" | "group" | "unit">;

const DIVISIONS: Record<string, DivisionConfig> = {
  CURRICULUM: { division: "Curriculum", group: "People" },
  ASKOR: { division: "Curriculum", group: "People", unit: "Assistant Coordinator" },
  "IT & INFRASTRUCTURE": { division: "IT & Infrastructure", group: "Operations" },
  "RND - Interactive Media": { division: "Game & XR", group: "Research and Development" },
  "RND - Website": { division: "Website", group: "Research and Development" },
  "RND - Mobile": { division: "Mobile", group: "Research and Development" },
  "R&D UX": { division: "HCI/UX", group: "Research and Development" },
  MEDIA: { division: "Media", group: "People" },
  RELATION: { division: "Public Relations", group: "People" },
  "HUMAN RESOURCE": { division: "Human Resource", group: "People" },
  SEKBEN: { division: "Human Resource", group: "People", unit: "Secretariat" },
};

const FOCUS_BY_DIVISION: Record<MemberDivision, readonly string[]> = {
  Professors: ["Research", "Mentorship", "Laboratory direction"],
  Website: ["Web development", "JavaScript", "UI engineering"],
  Mobile: ["Mobile development", "Flutter", "Android"],
  "HCI/UX": ["User research", "Interaction design", "Prototyping"],
  "Game & XR": ["Game development", "VR", "XR"],
  "IT & Infrastructure": ["Infrastructure", "Systems", "Developer tools"],
  "Public Relations": ["Partnerships", "Communication", "Community"],
  Media: ["Visual storytelling", "Content", "Production"],
  Curriculum: ["Learning design", "Curriculum", "Student development"],
  "Human Resource": ["People operations", "Team culture", "Recruitment"],
};

const MISSING_PORTRAITS = new Set(["a-agung-ngurah-bayu-widia-putra"]);

const MEMBER_SEEDS: readonly (readonly [string, string, string?])[] = [
  ["CURRICULUM", "Ihtishamul Hasan", "Samhasan"],
  ["CURRICULUM", "Tobias Andra Valentino", "Tobi"],
  ["CURRICULUM", "Ghefira Addien Mifta Mu'afa", "Gefi"],
  ["CURRICULUM", "Alvianto Hery Sarborn", "Hery"],
  ["CURRICULUM", "Rahma Aliyyah", "Rahma"],
  ["ASKOR", "Muhammad Bagas Arya", "Bagas"],
  ["ASKOR", "Sandhika Rizqi Ramadhan", "Dhika"],
  ["IT & INFRASTRUCTURE", "Muhammad Idham Ma'arif", "Idham"],
  ["IT & INFRASTRUCTURE", "Syafa Hadyan Rasendriya", "Ssh"],
  ["IT & INFRASTRUCTURE", "Rizky Mardhani", "Rizky"],
  ["IT & INFRASTRUCTURE", "Muhammad Naufal Mathara Rahman", "Naufal"],
  ["RND - Interactive Media", "Muhammad Abyan Syauqi", "Abyan"],
  ["RND - Interactive Media", "Athar Iftikhar Akhsan", "Athar"],
  ["RND - Interactive Media", "Nurul Inayah", "Kayee"],
  ["RND - Interactive Media", "Muhammad Raditya Arsyad", "Radit"],
  ["RND - Interactive Media", "Rizqy Jauhary Atsaany", "Rizqy"],
  ["RND - Interactive Media", "Mohammad Eka Faturrachman", "Fatur"],
  ["RND - Interactive Media", "Devanida Ratna Adiningrum", "Nana"],
  ["RND - Interactive Media", "Dafid Rosydan Hanif", "Dafid"],
  ["RND - Interactive Media", "A. Agung Ngurah Bayu Widia Putra", "Agung"],
  ["RND - Interactive Media", "Laurensia Natania Nintaria Hutagaol", "Lauren"],
  ["RND - Website", "Azkal Baihaqi Putra Sandita", "Azkal"],
  ["RND - Website", "Jevon Mozart Christian Bano", "Jevon"],
  ["RND - Website", "Dealova Nabila Salmah", "Deva"],
  ["RND - Website", "Dirga Yuditama", "Dirga"],
  ["RND - Website", "Azmi Al Ghifari Rahman", "Azmi"],
  ["RND - Website", "Muhammad Raka Fadillah", "Raka"],
  ["RND - Website", "Willy Gregory", "Willy"],
  ["RND - Website", "Filzah Mufidah", "Filzah"],
  ["RND - Website", "Risqi Achmad Fahreal", "Xfhreall"],
  ["RND - Website", "Anak Agung Ngurah Aditya Wirayudha", "Aditkun"],
  ["RND - Mobile", "Johan Arizona", "Arizona"],
  ["RND - Mobile", "Samuel Alfito Deanova", "Ovan"],
  ["RND - Mobile", "Ade Nugroho", "Ade"],
  ["RND - Mobile", "Mukti Abdi Syukur", "Abdi"],
  ["RND - Mobile", "Rhesa Tsaqif Adyatma", "Rhesa"],
  ["RND - Mobile", "Mohamad Robi Alwan", "Robi"],
  ["RND - Mobile", "Rafi Ananta Nugraha", "Rafi"],
  ["RND - Mobile", "Dzikri Murtadlo", "Dzikri"],
  ["RND - Mobile", "Mohammad Rozan Hanan", "Rozann"],
  ["RND - Mobile", "Exel Boy Alfanso", "Exel"],
  ["R&D UX", "Alfredo Radhinal Mukhtar", "Alfred"],
  ["R&D UX", "Yosefina Agustine Kartini Ofong", "Titin"],
  ["R&D UX", "Kania Khalifa Kurniadi", "Kania"],
  ["R&D UX", "Anasya Laili Rahmadani"],
  ["R&D UX", "Ahmad Akmal Syafi'i", "Akmal"],
  ["R&D UX", "Nada Musyaffa Bilhaqi", "Daffa"],
  ["R&D UX", "Raynanta Aulia Nanda", "Ray"],
  ["MEDIA", "Sabita Khansa Dewi", "Tata"],
  ["MEDIA", "Ayudya Nandira Afifah", "Didi"],
  ["MEDIA", "Rahmi Arsy Maulida", "Arsy"],
  ["MEDIA", "Muhammad Gilang Hafizh", "Gilang"],
  ["MEDIA", "Rarendra Adi Prabowo", "Rendra"],
  ["RELATION", "Nova Kurnia Putri", "Nova"],
  ["RELATION", "Githapati Prabuja Kemala Detha"],
  ["RELATION", "Muhammad Ramadhika Esanof", "Dhika"],
  ["RELATION", "Muhammad Zaki Anggoro", "Zaki"],
  ["RELATION", "Edgar Jason Husin", "Jason"],
  ["HUMAN RESOURCE", "Mutiara Shabrina", "Mutiara"],
  ["HUMAN RESOURCE", "Ezrasto Mahardika Maydiputra", "Asto"],
  ["HUMAN RESOURCE", "Jefri Satria Ferdiansyah", "Jefri"],
  ["HUMAN RESOURCE", "M. Dhika Ferdiansyah", "Dhika"],
  ["HUMAN RESOURCE", "Rananda Ardiawan", "Regi"],
  ["SEKBEN", "Aisha Maryam", "Aisha"],
  ["SEKBEN", "Rosyida Dimitri", "Ochi"],
];

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const ACCENTS: readonly MemberAccent[] = ["blue", "yellow", "red", "green"];

export const MEMBERS: readonly Member[] = MEMBER_SEEDS.map(
  ([sourceDivision, name, nickname], index) => {
    const { division, group, unit } = DIVISIONS[sourceDivision];
    const slug = slugify(name);

    return {
      accent: ACCENTS[index % ACCENTS.length],
      bio: `A student member in MGM Laboratory's ${division} division.`,
      division,
      group,
      hasPortrait: !MISSING_PORTRAITS.has(slug),
      labFocus: FOCUS_BY_DIVISION[division],
      name,
      nickname,
      role: "Student Member",
      slug,
      unit,
    };
  },
);

export const MEMBER_DIVISIONS = [
  "Professors",
  "Website",
  "Mobile",
  "HCI/UX",
  "Game & XR",
  "IT & Infrastructure",
  "Public Relations",
  "Media",
  "Curriculum",
  "Human Resource",
] as const satisfies readonly MemberDivision[];

export function getMemberBySlug(slug: string) {
  return MEMBERS.find((member) => member.slug === slug);
}
