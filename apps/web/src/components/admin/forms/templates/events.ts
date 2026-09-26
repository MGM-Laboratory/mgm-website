import { choices, when } from "./helpers";
import { rt, ul } from "./rich";
import type { FormTemplate } from "./types";

export const EVENT_TEMPLATES: FormTemplate[] = [
  {
    id: "event-registration",
    name: "Event registration",
    category: "events",
    featured: true,
    description:
      "Sign attendees up for a talk, showcase or open lab day, with ticket types and access needs.",
    document: {
      title: "Event registration",
      welcome: {
        eyebrow: "MGM Laboratory",
        title: "Save your seat",
        body: rt(
          "Register for our next event at the Multimedia, Game & Mobile laboratory, Fakultas Ilmu Komputer, Universitas Brawijaya.",
          "It takes about two minutes. We will email your confirmation right after.",
        ),
        buttonLabel: "Register",
      },
      fields: [
        { id: "q_name", type: "name", label: "What's your name?", required: true },
        {
          id: "q_email",
          type: "email",
          label: "Where should we send your confirmation?",
          placeholder: "name@example.com",
          required: true,
          width: "half",
        },
        {
          id: "q_phone",
          type: "phone",
          label: "Phone or WhatsApp number",
          help: "Only used for last-minute changes to the schedule.",
          defaultCountry: "ID",
          width: "half",
        },
        {
          id: "q_affiliation",
          type: "multiple_choice",
          label: "Which describes you best?",
          required: true,
          options: choices("aff", [
            ["student", "Universitas Brawijaya student"],
            ["staff", "Universitas Brawijaya lecturer or staff"],
            ["other_campus", "Student or staff from another campus"],
            ["industry", "Industry or community"],
          ]),
        },
        {
          id: "q_institution",
          type: "short_text",
          label: "Which institution or company are you from?",
          visibleIf: {
            match: "any",
            rules: [
              {
                subject: "q_affiliation",
                operator: "includes_any",
                value: ["aff_other_campus", "aff_industry"],
              },
            ],
          },
        },
        {
          id: "page_ticket",
          type: "page_break",
          label: "",
          pageTitle: "Your ticket",
        },
        {
          id: "q_ticket",
          type: "picture_choice",
          label: "Which pass would you like?",
          required: true,
          optionLayout: "grid",
          maxSelections: 1,
          options: [
            {
              id: "tix_talks",
              label: "Talks only",
              description: "Keynotes and panels in the main hall.",
            },
            {
              id: "tix_full",
              label: "Full day",
              description: "Talks, demos and the afternoon workshop.",
            },
            {
              id: "tix_online",
              label: "Online",
              description: "Join the livestream from anywhere.",
            },
          ],
        },
        {
          id: "q_sessions",
          type: "checkboxes",
          label: "Which sessions are you most interested in?",
          options: choices("ses", [
            ["games", "Game development"],
            ["mobile", "Mobile apps"],
            ["ux", "UX research"],
            ["xr", "AR and VR"],
            ["media", "Interactive media"],
          ]),
          optionLayout: "grid",
        },
        {
          id: "q_access",
          type: "yes_no",
          label: "Do you have any accessibility or dietary needs?",
          visibleIf: when("q_ticket", "not_equals", "tix_online"),
        },
        {
          id: "q_access_detail",
          type: "long_text",
          label: "Tell us what would help",
          rows: 3,
          visibleIf: when("q_access", "equals", true),
        },
        {
          id: "q_source",
          type: "dropdown",
          label: "How did you hear about this event?",
          options: choices("src", [
            ["instagram", "Instagram"],
            ["friend", "A friend or classmate"],
            ["lecturer", "A lecturer"],
            ["website", "The lab website"],
            ["other", "Somewhere else"],
          ]),
        },
        {
          id: "q_consent",
          type: "consent",
          label: "Photos and recordings",
          required: true,
          consentText: rt(
            "I understand the event may be photographed and recorded for the lab's publications.",
          ),
        },
        { id: "hid_source", type: "hidden", label: "Campaign", prefillParam: "utm_source" },
      ],
      endings: [
        {
          id: "ending_default",
          title: "You're registered, {{q_name}}",
          body: rt("A confirmation is on its way to your inbox. We look forward to seeing you."),
          showShare: true,
        },
        {
          id: "ending_online",
          when: when("q_ticket", "equals", "tix_online"),
          title: "See you on the stream",
          body: rt("We will email the livestream link the day before the event."),
          showShare: true,
        },
      ],
      design: {
        theme: "laboratory",
        layout: "classic",
        background: { scene: "orbit", intensity: "lively", pattern: "plus", dim: 40 },
        motion: { entrance: "rise", celebration: "confetti" },
      },
      settings: {
        receipt: {
          enabled: true,
          emailFieldId: "q_email",
          subject: "Your registration is confirmed",
          message: "Thanks for registering. Your answers are below.",
        },
      },
    },
  },
  {
    id: "event-rsvp",
    name: "RSVP",
    category: "events",
    description:
      "A quick yes, no or maybe, with plus-ones and arrival time for guests who are coming.",
    document: {
      title: "RSVP",
      welcome: {
        eyebrow: "You're invited",
        title: "Will you join us?",
        body: rt("Let us know if you can make it, so we can plan seats and snacks."),
        buttonLabel: "Reply",
        showDuration: false,
      },
      fields: [
        { id: "q_name", type: "name", label: "Your name", required: true },
        {
          id: "q_attending",
          type: "multiple_choice",
          label: "Can you make it?",
          required: true,
          optionLayout: "inline",
          options: choices("att", [
            ["yes", "Yes, I'll be there"],
            ["maybe", "Maybe"],
            ["no", "Sorry, I can't"],
          ]),
        },
        {
          id: "page_details",
          type: "page_break",
          label: "",
          pageTitle: "A few details",
          jumps: [
            {
              id: "jump_declined",
              when: when("q_attending", "equals", "att_no"),
              to: "ending:ending_declined",
            },
          ],
        },
        {
          id: "q_guests",
          type: "number",
          label: "How many guests are you bringing?",
          min: 0,
          max: 3,
          help: "Up to three guests per invitation.",
        },
        {
          id: "q_arrival",
          type: "time",
          label: "Around what time will you arrive?",
        },
        {
          id: "q_email",
          type: "email",
          label: "Email for the reminder",
          placeholder: "name@example.com",
        },
        {
          id: "q_note",
          type: "long_text",
          label: "Anything we should know?",
          rows: 3,
        },
      ],
      endings: [
        {
          id: "ending_default",
          title: "Thanks for letting us know",
          body: rt("We'll send a reminder a day before."),
        },
        {
          id: "ending_declined",
          title: "We'll miss you",
          body: rt("Thanks for replying. We hope to see you at the next one."),
          showShare: false,
        },
      ],
      design: {
        theme: "blush",
        layout: "conversational",
        font: "fraunces",
        buttonShape: "pill",
        background: { scene: "constellation", intensity: "calm", pattern: "none", dim: 40 },
        motion: { entrance: "pop", celebration: "bloom" },
      },
      settings: { showQuestionNumbers: false },
    },
  },
  {
    id: "workshop-signup",
    name: "Workshop signup",
    category: "events",
    description:
      "Register participants for a hands-on workshop and learn their experience level up front.",
    document: {
      title: "Workshop signup",
      welcome: {
        eyebrow: "Hands-on workshop",
        title: "Join the workshop",
        body: rt(
          "Seats are limited so everyone gets time with a mentor. Tell us a little about your experience so we can pair you well.",
        ),
        buttonLabel: "Sign up",
      },
      fields: [
        { id: "q_name", type: "name", label: "Your name", required: true },
        { id: "q_email", type: "email", label: "Email", required: true, width: "half" },
        {
          id: "q_nim",
          type: "short_text",
          label: "Student number (NIM), if you have one",
          width: "half",
        },
        {
          id: "q_track",
          type: "dropdown",
          label: "Which workshop track?",
          required: true,
          options: choices("trk", [
            ["unity", "Game prototyping with Unity"],
            ["flutter", "Mobile apps with Flutter"],
            ["figma", "Interface design in Figma"],
            ["blender", "3D assets in Blender"],
          ]),
        },
        {
          id: "q_level",
          type: "opinion_scale",
          label: "How experienced are you with this topic?",
          min: 1,
          max: 5,
          minLabel: "Brand new",
          maxLabel: "Very experienced",
          required: true,
        },
        {
          id: "q_laptop",
          type: "yes_no",
          label: "Will you bring your own laptop?",
          required: true,
        },
        {
          id: "c_laptop",
          type: "callout",
          label: "",
          calloutTone: "warning",
          content: rt(
            "We have a few lab computers to lend. We'll reserve one for you and email the details.",
          ),
          visibleIf: when("q_laptop", "equals", false),
        },
        {
          id: "q_goals",
          type: "long_text",
          label: "What would you like to make or learn by the end?",
          rows: 4,
          maxLength: 1000,
        },
        {
          id: "q_portfolio",
          type: "url",
          label: "A link to your work (optional)",
          placeholder: "https://",
        },
      ],
      endings: [
        {
          id: "ending_default",
          title: "You're on the list",
          body: rt("We'll confirm your seat by email within two working days."),
        },
      ],
      design: {
        theme: "sky",
        layout: "classic",
        density: "comfortable",
        background: { scene: "blocks", intensity: "lively", pattern: "quads", dim: 40 },
      },
      settings: {
        responseLimit: 40,
        closedTitle: "The workshop is full",
        closedMessage: "All seats are taken. Follow the lab for the next session.",
        receipt: { enabled: true, emailFieldId: "q_email", subject: "Workshop signup received" },
      },
    },
  },
  {
    id: "hackathon-registration",
    name: "Hackathon registration",
    category: "events",
    description:
      "Team or solo registration for a game jam or hackathon, with skills, team members and T-shirt size.",
    document: {
      title: "Hackathon registration",
      welcome: {
        eyebrow: "48-hour game jam",
        title: "Build something wild in a weekend",
        body: rt(
          "Register as a team or on your own and we'll help you find one. Participants must be enrolled students.",
          ul(
            "Theme revealed at the opening",
            "Mentors from the lab on site",
            "Prizes for the top three teams",
          ),
        ),
        buttonLabel: "Let's go",
      },
      fields: [
        { id: "q_name", type: "name", label: "Your name", required: true },
        { id: "q_email", type: "email", label: "Email", required: true, width: "half" },
        {
          id: "q_phone",
          type: "phone",
          label: "WhatsApp number",
          defaultCountry: "ID",
          width: "half",
        },
        {
          id: "q_university",
          type: "short_text",
          label: "University",
          placeholder: "Universitas Brawijaya",
          required: true,
        },
        {
          id: "q_mode",
          type: "multiple_choice",
          label: "Are you joining with a team?",
          required: true,
          options: choices("mode", [
            ["team", "Yes, I have a team"],
            ["solo", "No, match me with one"],
          ]),
        },
        {
          id: "page_team",
          type: "page_break",
          label: "",
          pageTitle: "Your team",
          jumps: [
            { id: "jump_solo", when: when("q_mode", "equals", "mode_solo"), to: "page_skills" },
          ],
        },
        {
          id: "q_team_name",
          type: "short_text",
          label: "Team name",
          required: true,
          maxLength: 60,
        },
        {
          id: "q_team_size",
          type: "slider",
          label: "How many people are on the team, including you?",
          min: 2,
          max: 5,
          step: 1,
        },
        {
          id: "q_team_members",
          type: "long_text",
          label: "Team members' names and student numbers",
          help: "One person per line.",
          rows: 4,
        },
        { id: "page_skills", type: "page_break", label: "", pageTitle: "Your skills" },
        {
          id: "q_roles",
          type: "multiselect",
          label: "What can you bring to a team?",
          required: true,
          options: choices("role", [
            ["prog", "Programming"],
            ["art2d", "2D art"],
            ["art3d", "3D modelling"],
            ["audio", "Sound and music"],
            ["design", "Game design"],
            ["writing", "Narrative and writing"],
            ["pm", "Production"],
          ]),
        },
        {
          id: "q_engine",
          type: "checkboxes",
          label: "Engines and tools you're comfortable with",
          optionLayout: "grid",
          allowOther: true,
          otherLabel: "Something else",
          options: choices("eng", [
            ["unity", "Unity"],
            ["godot", "Godot"],
            ["unreal", "Unreal Engine"],
            ["gamemaker", "GameMaker"],
            ["web", "Web (Phaser, three.js)"],
          ]),
        },
        {
          id: "q_shirt",
          type: "dropdown",
          label: "T-shirt size",
          options: choices("tee", [
            ["s", "S"],
            ["m", "M"],
            ["l", "L"],
            ["xl", "XL"],
            ["xxl", "XXL"],
          ]),
        },
        {
          id: "q_rules",
          type: "consent",
          label: "Jam rules",
          required: true,
          consentText: rt(
            "I will follow the code of conduct and build the game during the jam. Existing assets must be credited.",
          ),
        },
      ],
      endings: [
        {
          id: "ending_default",
          title: "See you at the jam",
          body: rt("We'll email the schedule and the Discord invite a week before the kickoff."),
        },
        {
          id: "ending_solo",
          when: when("q_mode", "equals", "mode_solo"),
          title: "We'll find you a team",
          body: rt("Team matching opens a few days before the jam. Watch your inbox."),
        },
      ],
      design: {
        theme: "nebula",
        colorMode: "dark",
        font: "mono",
        layout: "classic",
        fieldStyle: "soft",
        buttonShape: "square",
        progress: "steps",
        background: { scene: "blocks", intensity: "wild", pattern: "x", dim: 40 },
        motion: { entrance: "slide", speed: "fast", celebration: "fireworks" },
      },
      settings: {
        receipt: {
          enabled: true,
          emailFieldId: "q_email",
          subject: "Game jam registration received",
        },
      },
    },
  },
  {
    id: "webinar-feedback",
    name: "Webinar feedback",
    category: "events",
    description:
      "Short feedback after an online talk: overall rating, speaker, audio and what to cover next.",
    document: {
      title: "Webinar feedback",
      welcome: {
        eyebrow: "Thanks for watching",
        title: "How was the webinar?",
        body: rt("Five quick questions help us make the next session better."),
        buttonLabel: "Give feedback",
      },
      fields: [
        {
          id: "q_overall",
          type: "rating",
          label: "Overall, how would you rate the webinar?",
          max: 5,
          ratingIcon: "star",
          required: true,
        },
        {
          id: "q_quality",
          type: "matrix",
          label: "Rate each part of the session",
          rowsList: [
            { id: "row_content", label: "Content" },
            { id: "row_speaker", label: "Speaker" },
            { id: "row_audio", label: "Audio and video" },
            { id: "row_qa", label: "Q&A" },
          ],
          columnsList: [
            { id: "col_poor", label: "Poor" },
            { id: "col_ok", label: "Okay" },
            { id: "col_good", label: "Good" },
            { id: "col_great", label: "Great" },
          ],
        },
        {
          id: "q_length",
          type: "multiple_choice",
          label: "The length was...",
          optionLayout: "inline",
          options: choices("len", [
            ["short", "Too short"],
            ["right", "Just right"],
            ["long", "Too long"],
          ]),
        },
        {
          id: "q_improve",
          type: "long_text",
          label: "What should we do differently?",
          rows: 3,
          visibleIf: { match: "all", rules: [{ subject: "q_overall", operator: "lte", value: 3 }] },
        },
        {
          id: "q_topics",
          type: "checkboxes",
          label: "What would you like a future webinar on?",
          allowOther: true,
          options: choices("top", [
            ["gamedesign", "Game design"],
            ["mobileperf", "Mobile performance"],
            ["uxmethods", "UX research methods"],
            ["xr", "XR development"],
            ["careers", "Careers in tech"],
          ]),
        },
        { id: "hid_session", type: "hidden", label: "Session", prefillParam: "session" },
      ],
      endings: [
        {
          id: "ending_default",
          title: "Thank you",
          body: rt("Your feedback goes straight to the organisers."),
        },
      ],
      design: {
        theme: "iris",
        layout: "conversational",
        background: { scene: "orbit", intensity: "calm", pattern: "none", dim: 40 },
        motion: { entrance: "blur", celebration: "bloom" },
      },
    },
  },
];
