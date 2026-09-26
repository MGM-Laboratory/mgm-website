import { choices, when } from "./helpers";
import { rt, ul } from "./rich";
import type { FormTemplate } from "./types";

export const RESEARCH_TEMPLATES: FormTemplate[] = [
  {
    id: "participant-screener",
    name: "Research participant screener",
    category: "research",
    description:
      "Screen volunteers for a study by age, habits and devices, and route ineligible people politely.",
    document: {
      title: "Research participant screener",
      welcome: {
        eyebrow: "Take part in a study",
        title: "Help us research how people play and learn",
        body: rt(
          "MGM Laboratory runs user studies on games, mobile apps and interactive media. This screener checks whether a study fits you.",
          "It takes about three minutes. Selected participants receive a small token of thanks.",
        ),
        buttonLabel: "Check eligibility",
      },
      fields: [
        {
          id: "q_age",
          type: "number",
          label: "How old are you?",
          required: true,
          min: 0,
          max: 120,
        },
        {
          id: "page_habits",
          type: "page_break",
          label: "",
          pageTitle: "Your habits",
          jumps: [
            {
              id: "jump_minor",
              when: { match: "all", rules: [{ subject: "q_age", operator: "lt", value: 18 }] },
              to: "ending:ending_ineligible",
            },
          ],
        },
        {
          id: "q_play",
          type: "multiple_choice",
          label: "How often do you play video games?",
          required: true,
          options: choices("play", [
            ["daily", "Every day"],
            ["weekly", "A few times a week"],
            ["monthly", "A few times a month"],
            ["rarely", "Rarely or never"],
          ]),
        },
        {
          id: "q_genres",
          type: "multiselect",
          label: "Which genres do you enjoy?",
          visibleIf: when("q_play", "not_equals", "play_rarely"),
          options: choices("gen", [
            ["action", "Action"],
            ["puzzle", "Puzzle"],
            ["rpg", "Role-playing"],
            ["strategy", "Strategy"],
            ["casual", "Casual and mobile"],
            ["edu", "Educational"],
          ]),
        },
        {
          id: "q_devices",
          type: "checkboxes",
          label: "Which devices do you own?",
          required: true,
          optionLayout: "grid",
          options: choices("dvc", [
            ["android", "Android phone"],
            ["iphone", "iPhone"],
            ["tablet", "Tablet"],
            ["console", "Game console"],
            ["vr", "VR headset"],
          ]),
        },
        {
          id: "q_prior",
          type: "yes_no",
          label: "Have you taken part in a user study before?",
        },
        {
          id: "page_availability",
          type: "page_break",
          label: "",
          pageTitle: "Availability and contact",
        },
        {
          id: "q_days",
          type: "checkboxes",
          label: "Which days suit you for a one-hour session at the lab?",
          optionLayout: "inline",
          options: choices("day", [
            ["mon", "Mon"],
            ["tue", "Tue"],
            ["wed", "Wed"],
            ["thu", "Thu"],
            ["fri", "Fri"],
          ]),
        },
        { id: "q_name", type: "name", label: "Your name", required: true },
        { id: "q_email", type: "email", label: "Email", required: true },
        {
          id: "q_consent",
          type: "consent",
          label: "Contact consent",
          required: true,
          consentText: rt(
            "I agree to be contacted about this study. My answers are kept only until the study ends.",
          ),
        },
      ],
      endings: [
        {
          id: "ending_default",
          title: "Thanks, you're in the pool",
          body: rt("If the study fits, a researcher will email you to schedule a session."),
          showShare: false,
        },
        {
          id: "ending_ineligible",
          title: "Thanks for your interest",
          body: rt(
            "This study is for participants aged 18 and over. We hope to see you in a future study.",
          ),
          showShare: false,
        },
      ],
      design: {
        theme: "lagoon",
        layout: "classic",
        progress: "steps",
        background: { scene: "constellation", intensity: "calm", pattern: "none", dim: 40 },
        motion: { entrance: "rise", celebration: "bloom" },
      },
      settings: { collectLocation: false },
    },
  },
  {
    id: "consent-form",
    name: "Consent form",
    category: "research",
    description:
      "Informed consent for a study: what participants do, their rights, and a signature.",
    document: {
      title: "Informed consent",
      welcome: {
        eyebrow: "Before we begin",
        title: "Informed consent",
        body: rt(
          "Please read the information below carefully. You can ask the researcher anything before signing.",
        ),
        buttonLabel: "Read and sign",
        showQuestionCount: false,
      },
      fields: [
        { id: "h_about", type: "heading", label: "About the study", headingLevel: 2 },
        {
          id: "p_about",
          type: "paragraph",
          label: "",
          content: rt(
            "You are invited to take part in a study run by MGM Laboratory, Fakultas Ilmu Komputer, Universitas Brawijaya. The study looks at how people interact with a prototype application.",
            "A session takes about 45 minutes. You will try a few tasks while thinking aloud, then answer a short questionnaire.",
          ),
        },
        { id: "h_rights", type: "heading", label: "Your rights", headingLevel: 2 },
        {
          id: "p_rights",
          type: "paragraph",
          label: "",
          content: rt(
            ul(
              "Taking part is voluntary. You may stop at any time without giving a reason.",
              "Your data is stored securely and reported only in anonymised form.",
              "You may ask for your data to be deleted until the analysis is complete.",
            ),
          ),
        },
        {
          id: "c_contact",
          type: "callout",
          label: "",
          calloutTone: "info",
          content: rt(
            "Questions about the study can be sent to the researcher named on your session invitation.",
          ),
        },
        { id: "spacer_1", type: "spacer", label: "", spacerSize: "md" },
        {
          id: "q_agree_participate",
          type: "consent",
          label: "Participation",
          required: true,
          consentText: rt(
            "I have read the information above and agree to take part in this study.",
          ),
        },
        {
          id: "q_recording",
          type: "multiple_choice",
          label: "May we record the session?",
          required: true,
          options: choices("rec", [
            ["av", "Yes, audio and screen"],
            ["audio", "Audio only"],
            ["none", "No recording, notes only"],
          ]),
        },
        { id: "q_name", type: "name", label: "Full name", required: true },
        { id: "q_date", type: "date", label: "Date", required: true, width: "half" },
        { id: "q_signature", type: "signature", label: "Signature", required: true },
        { id: "hid_study", type: "hidden", label: "Study code", prefillParam: "study" },
      ],
      endings: [
        {
          id: "ending_default",
          title: "Thank you",
          body: rt("Your consent is recorded. The researcher will start the session shortly."),
          showShare: false,
        },
      ],
      design: {
        theme: "mono",
        layout: "classic",
        font: "geist",
        density: "comfortable",
        background: { scene: "none", intensity: "calm", pattern: "none", dim: 40 },
        motion: { entrance: "rise", celebration: "none", interactive: false },
      },
      settings: { autosave: false, showQuestionNumbers: false },
    },
  },
  {
    id: "usability-test-intake",
    name: "Usability test intake",
    category: "research",
    description:
      "Collect background before a usability session: experience, assistive tech and devices.",
    document: {
      title: "Usability test intake",
      welcome: {
        eyebrow: "Usability session",
        title: "Before your session",
        body: rt("A little background helps us set up the right device and tasks for you."),
        buttonLabel: "Start",
      },
      fields: [
        { id: "q_name", type: "name", label: "Your name", required: true },
        { id: "q_email", type: "email", label: "Email", required: true },
        {
          id: "q_experience",
          type: "opinion_scale",
          label: "How comfortable are you with smartphone apps?",
          min: 1,
          max: 5,
          minLabel: "Not at all",
          maxLabel: "Very",
          required: true,
        },
        {
          id: "q_os",
          type: "multiple_choice",
          label: "Which phone do you use every day?",
          optionLayout: "inline",
          options: choices("os", [
            ["android", "Android"],
            ["ios", "iPhone"],
            ["none", "I don't use one"],
          ]),
        },
        {
          id: "q_assistive",
          type: "yes_no",
          label: "Do you use any assistive technology?",
        },
        {
          id: "q_assistive_which",
          type: "checkboxes",
          label: "Which ones?",
          allowOther: true,
          visibleIf: when("q_assistive", "equals", true),
          options: choices("at", [
            ["reader", "Screen reader"],
            ["zoom", "Screen magnification"],
            ["voice", "Voice control"],
            ["switch", "Switch access"],
          ]),
        },
        {
          id: "q_apps",
          type: "long_text",
          label: "Which apps do you use most, and what for?",
          rows: 3,
        },
        {
          id: "q_slot",
          type: "datetime",
          label: "Preferred session start",
          help: "Sessions run on weekdays between 09:00 and 16:00.",
        },
      ],
      endings: [
        {
          id: "ending_default",
          title: "All set",
          body: rt("We'll confirm your session time by email."),
        },
      ],
      design: {
        theme: "violet",
        layout: "conversational",
        background: { scene: "orbit", intensity: "calm", pattern: "none", dim: 40 },
      },
      settings: { collectLocation: false },
    },
  },
  {
    id: "user-interview-scheduling",
    name: "User interview scheduling",
    category: "research",
    description:
      "Let interviewees pick a format, a date and a time window, and tell you how to reach them.",
    document: {
      title: "Schedule an interview",
      welcome: {
        eyebrow: "Research interview",
        title: "Pick a time that works for you",
        body: rt("Interviews last about 30 minutes, in person at the lab or online."),
        buttonLabel: "Choose a time",
      },
      fields: [
        { id: "q_name", type: "name", label: "Your name", required: true },
        { id: "q_email", type: "email", label: "Email", required: true },
        {
          id: "q_format",
          type: "multiple_choice",
          label: "How would you like to meet?",
          required: true,
          options: choices("fmt", [
            ["lab", "In person at the lab, Fakultas Ilmu Komputer"],
            ["online", "Online video call"],
          ]),
        },
        {
          id: "q_platform",
          type: "dropdown",
          label: "Which video tool do you prefer?",
          visibleIf: when("q_format", "equals", "fmt_online"),
          options: choices("tool", [
            ["meet", "Google Meet"],
            ["zoom", "Zoom"],
            ["teams", "Microsoft Teams"],
          ]),
        },
        {
          id: "q_date",
          type: "date",
          label: "Preferred date",
          required: true,
          width: "half",
        },
        {
          id: "q_time",
          type: "time",
          label: "Preferred start time",
          required: true,
          width: "half",
        },
        {
          id: "q_backup",
          type: "date",
          label: "A backup date",
          width: "half",
        },
        {
          id: "q_timezone",
          type: "country",
          label: "Which country will you join from?",
          visibleIf: when("q_format", "equals", "fmt_online"),
        },
        {
          id: "q_notes",
          type: "long_text",
          label: "Anything we should know beforehand?",
          rows: 2,
        },
      ],
      endings: [
        {
          id: "ending_default",
          title: "Request received",
          body: rt(
            "We'll send a calendar invitation for your chosen slot, or suggest the closest free one.",
          ),
          showShare: false,
        },
      ],
      design: {
        theme: "sky",
        layout: "classic",
        background: { scene: "paper", intensity: "calm", pattern: "none", dim: 40 },
        motion: { entrance: "slide", celebration: "bloom" },
      },
      settings: {
        receipt: { enabled: true, emailFieldId: "q_email", subject: "Your interview request" },
      },
    },
  },
  {
    id: "academic-survey",
    name: "Academic survey",
    category: "research",
    description:
      "A structured research questionnaire with demographics, Likert blocks and open questions.",
    document: {
      title: "Academic survey",
      welcome: {
        eyebrow: "Research questionnaire",
        title: "Digital media habits of university students",
        body: rt(
          "This questionnaire is part of a research project at MGM Laboratory, Universitas Brawijaya. It takes about eight minutes, and your responses are anonymous.",
        ),
        buttonLabel: "Begin the survey",
      },
      fields: [
        {
          id: "q_consent",
          type: "consent",
          label: "Consent",
          required: true,
          consentText: rt(
            "I am 18 or older and agree that my anonymous answers may be used for research.",
          ),
        },
        { id: "page_about", type: "page_break", label: "", pageTitle: "About you" },
        {
          id: "q_age_group",
          type: "multiple_choice",
          label: "Age group",
          required: true,
          optionLayout: "inline",
          options: choices("age", [
            ["18_20", "18 to 20"],
            ["21_23", "21 to 23"],
            ["24_26", "24 to 26"],
            ["27", "27 or older"],
          ]),
        },
        {
          id: "q_faculty",
          type: "dropdown",
          label: "Faculty",
          options: choices("fac", [
            ["filkom", "Computer Science"],
            ["ft", "Engineering"],
            ["feb", "Economics and Business"],
            ["fib", "Cultural Studies"],
            ["other", "Another faculty"],
          ]),
        },
        {
          id: "q_year",
          type: "number",
          label: "Year of study",
          min: 1,
          max: 8,
        },
        { id: "page_habits", type: "page_break", label: "", pageTitle: "Your media habits" },
        {
          id: "q_hours",
          type: "slider",
          label: "Hours per day on your phone, outside study",
          min: 0,
          max: 12,
          step: 0.5,
          decimals: 1,
          suffix: "h",
        },
        {
          id: "q_likert",
          type: "matrix",
          label: "How much do you agree with each statement?",
          required: true,
          rowsList: [
            { id: "row_focus", label: "Notifications interrupt my study" },
            { id: "row_learn", label: "I learn useful things from games" },
            { id: "row_social", label: "Social media helps my coursework" },
            { id: "row_limit", label: "I try to limit my screen time" },
          ],
          columnsList: [
            { id: "col_1", label: "Strongly disagree" },
            { id: "col_2", label: "Disagree" },
            { id: "col_3", label: "Neutral" },
            { id: "col_4", label: "Agree" },
            { id: "col_5", label: "Strongly agree" },
          ],
        },
        {
          id: "q_rank",
          type: "ranking",
          label: "Rank these by how much time you spend on them",
          options: choices("rank", [
            ["social", "Social media"],
            ["video", "Video streaming"],
            ["games", "Games"],
            ["news", "News and reading"],
            ["msg", "Messaging"],
          ]),
        },
        {
          id: "q_quote",
          type: "quote",
          label: "",
          content: rt(
            "There are no right or wrong answers. We are interested in your own experience.",
          ),
        },
        {
          id: "q_open",
          type: "long_text",
          label: "Describe a moment when technology helped or hurt your learning",
          rows: 5,
          minLength: 20,
        },
      ],
      endings: [
        {
          id: "ending_default",
          title: "Thank you for contributing",
          body: rt("Summary findings will be published on the lab's publications page."),
        },
      ],
      design: {
        theme: "storybook",
        font: "fraunces",
        layout: "classic",
        progress: "bar",
        background: { scene: "paper", intensity: "calm", pattern: "leaves", dim: 40 },
        motion: { entrance: "type", celebration: "none" },
      },
      settings: { onePerDevice: true, collectLocation: false, minSeconds: 30 },
    },
  },
];
