import { choices } from "./helpers";
import { rt } from "./rich";
import type { FormTemplate } from "./types";

export const COMMUNITY_TEMPLATES: FormTemplate[] = [
  {
    id: "newsletter-signup",
    name: "Newsletter signup",
    category: "community",
    description: "A short signup for lab news, with topics, frequency and a clear opt-in.",
    document: {
      title: "Newsletter signup",
      welcome: {
        enabled: false,
        title: "Newsletter signup",
        buttonLabel: "Start",
      },
      fields: [
        {
          id: "img_logo",
          type: "image",
          label: "",
          media: { kind: "image", url: "/logo.svg", alt: "MGM Laboratory logo", fit: "contain" },
          align: "center",
        },
        {
          id: "h_title",
          type: "heading",
          label: "News from the lab, once a month",
          headingLevel: 1,
          align: "center",
        },
        {
          id: "p_intro",
          type: "paragraph",
          label: "",
          content: rt(
            "New projects, published research, open calls and events from MGM Laboratory. No spam, unsubscribe any time.",
          ),
        },
        {
          id: "q_email",
          type: "email",
          label: "Email",
          required: true,
          placeholder: "name@example.com",
        },
        { id: "q_first", type: "short_text", label: "First name (optional)" },
        {
          id: "q_topics",
          type: "checkboxes",
          label: "What would you like to hear about?",
          optionLayout: "grid",
          options: choices("topic", [
            ["projects", "Projects"],
            ["research", "Research"],
            ["events", "Events"],
            ["careers", "Open positions"],
          ]),
        },
        {
          id: "q_frequency",
          type: "multiple_choice",
          label: "How often?",
          optionLayout: "inline",
          options: choices("frq", [
            ["monthly", "Monthly digest"],
            ["major", "Only major news"],
          ]),
        },
        {
          id: "q_optin",
          type: "consent",
          label: "Opt-in",
          required: true,
          consentText: rt(
            "Send me the MGM Laboratory newsletter. I can unsubscribe with one click in any email.",
          ),
        },
        { id: "hid_utm", type: "hidden", label: "Campaign", prefillParam: "utm_campaign" },
      ],
      endings: [
        {
          id: "ending_default",
          title: "You're subscribed",
          body: rt("Look out for the next issue in your inbox."),
        },
      ],
      design: {
        theme: "laboratory",
        layout: "classic",
        align: "center",
        background: { scene: "orbit", intensity: "calm", pattern: "circle", dim: 40 },
        motion: { entrance: "rise", celebration: "bloom" },
      },
      settings: { showQuestionNumbers: false },
    },
  },
  {
    id: "alumni-survey",
    name: "Alumni survey",
    category: "community",
    description:
      "Stay in touch with former members: where they are now, how the lab helped, and how to give back.",
    document: {
      title: "Alumni survey",
      welcome: {
        eyebrow: "MGM Laboratory alumni",
        title: "Where are you now?",
        body: rt(
          "We love hearing where lab alumni ended up. Your answers help current members plan their paths.",
        ),
        buttonLabel: "Catch up",
      },
      fields: [
        { id: "q_name", type: "name", label: "Your name", required: true },
        { id: "q_email", type: "email", label: "Email you check these days", required: true },
        { id: "q_year", type: "number", label: "Year you left the lab", min: 2000, max: 2100 },
        { id: "q_country", type: "country", label: "Country you live in" },
        {
          id: "q_status",
          type: "multiple_choice",
          label: "What are you doing now?",
          required: true,
          allowOther: true,
          options: choices("st", [
            ["industry", "Working in industry"],
            ["startup", "Running a startup"],
            ["study", "Further study"],
            ["academia", "Teaching or research"],
          ]),
        },
        {
          id: "q_company",
          type: "short_text",
          label: "Company or institution",
          visibleIf: {
            match: "any",
            rules: [
              {
                subject: "q_status",
                operator: "includes_any",
                value: ["st_industry", "st_startup", "st_academia"],
              },
            ],
          },
        },
        {
          id: "q_impact",
          type: "matrix",
          label: "How much did the lab help you with...",
          rowsList: [
            { id: "row_tech", label: "Technical skills" },
            { id: "row_team", label: "Teamwork" },
            { id: "row_portfolio", label: "Your portfolio" },
            { id: "row_network", label: "Your network" },
          ],
          columnsList: [
            { id: "col_little", label: "A little" },
            { id: "col_some", label: "Somewhat" },
            { id: "col_lot", label: "A lot" },
          ],
        },
        {
          id: "q_nps",
          type: "nps",
          label: "How likely are you to recommend joining the lab to a student?",
          min: 0,
          max: 10,
          minLabel: "Not likely",
          maxLabel: "Extremely likely",
        },
        {
          id: "q_giveback",
          type: "checkboxes",
          label: "Would you like to give back?",
          options: choices("gb", [
            ["talk", "Give a talk"],
            ["mentor", "Mentor a student"],
            ["hire", "Hire interns"],
            ["none", "Not right now"],
          ]),
        },
        {
          id: "q_story",
          type: "long_text",
          label: "Any story or advice for current members?",
          rows: 4,
        },
      ],
      endings: [
        {
          id: "ending_default",
          title: "Thank you",
          body: rt("It's great to hear from you. Stay in touch."),
        },
      ],
      design: {
        theme: "storybook",
        layout: "classic",
        font: "fraunces",
        background: { scene: "paper", intensity: "calm", pattern: "none", dim: 40 },
        motion: { entrance: "type", celebration: "bloom" },
      },
    },
  },
  {
    id: "club-membership",
    name: "Pendaftaran anggota",
    category: "community",
    description:
      "Formulir berbahasa Indonesia untuk pendaftaran anggota baru lab, dengan divisi, portofolio dan jadwal.",
    document: {
      title: "Pendaftaran anggota MGM Laboratory",
      welcome: {
        eyebrow: "Open recruitment",
        title: "Bergabung dengan MGM Laboratory",
        body: rt(
          "Laboratorium Multimedia, Game & Mobile, Fakultas Ilmu Komputer, Universitas Brawijaya membuka pendaftaran anggota baru.",
          "Siapkan tautan portofolio atau berkas karya terbaikmu.",
        ),
        buttonLabel: "Daftar sekarang",
      },
      fields: [
        { id: "q_name", type: "name", label: "Nama lengkap", required: true },
        {
          id: "q_nim",
          type: "short_text",
          label: "NIM",
          required: true,
          width: "half",
          pattern:
            "########## | ########### | ############ | ############# | ############## | ###############",
          patternMessage: "NIM terdiri dari 10 sampai 15 angka.",
        },
        {
          id: "q_angkatan",
          type: "number",
          label: "Angkatan",
          min: 2015,
          max: 2100,
          width: "half",
        },
        { id: "q_email", type: "email", label: "Email", required: true, width: "half" },
        {
          id: "q_phone",
          type: "phone",
          label: "Nomor WhatsApp",
          required: true,
          defaultCountry: "ID",
          width: "half",
        },
        { id: "page_minat", type: "page_break", label: "", pageTitle: "Minat dan karya" },
        {
          id: "q_divisi",
          type: "multiple_choice",
          label: "Divisi pilihan",
          required: true,
          options: choices("div", [
            ["game", "Game"],
            ["mobile", "Mobile"],
            ["web", "Web"],
            ["uiux", "UI/UX"],
            ["multimedia", "Multimedia"],
          ]),
        },
        {
          id: "q_alasan",
          type: "long_text",
          label: "Mengapa kamu ingin bergabung?",
          required: true,
          rows: 4,
          minLength: 50,
        },
        {
          id: "q_skill",
          type: "rating",
          label: "Seberapa percaya diri kamu dengan kemampuan di divisi tersebut?",
          max: 5,
          ratingIcon: "bolt",
        },
        {
          id: "q_portofolio",
          type: "url",
          label: "Tautan portofolio",
          placeholder: "https://",
          visibleIf: {
            match: "any",
            rules: [
              {
                subject: "q_divisi",
                operator: "includes_any",
                value: ["div_uiux", "div_multimedia"],
              },
            ],
          },
        },
        {
          id: "q_karya",
          type: "file_upload",
          label: "Unggah karya (opsional)",
          accept: ["pdf", "image", "archive"],
          maxFiles: 3,
          maxFileMb: 25,
        },
        {
          id: "q_wawancara",
          type: "datetime",
          label: "Waktu wawancara yang kamu pilih",
          help: "Wawancara berlangsung sekitar 20 menit di lab.",
        },
        {
          id: "q_setuju",
          type: "consent",
          label: "Pernyataan",
          required: true,
          consentText: rt(
            "Saya menyatakan data yang saya isi benar dan bersedia mengikuti seluruh tahap seleksi.",
          ),
        },
      ],
      endings: [
        {
          id: "ending_default",
          title: "Pendaftaran berhasil",
          body: rt(
            "Terima kasih. Pengumuman tahap berikutnya akan dikirim melalui email dan WhatsApp.",
          ),
        },
      ],
      design: {
        theme: "sunburst",
        layout: "classic",
        progress: "steps",
        background: { scene: "blocks", intensity: "lively", pattern: "mixed", dim: 40 },
        motion: { entrance: "rise", celebration: "confetti" },
      },
      settings: {
        language: "id",
        receipt: {
          enabled: true,
          emailFieldId: "q_email",
          subject: "Pendaftaran anggota MGM Laboratory",
        },
      },
    },
  },
];
