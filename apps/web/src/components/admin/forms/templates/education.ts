import { scored } from "./helpers";
import { rt } from "./rich";
import type { FormTemplate } from "./types";

export const EDUCATION_TEMPLATES: FormTemplate[] = [
  {
    id: "knowledge-quiz",
    name: "Knowledge quiz with scoring",
    category: "education",
    featured: true,
    description:
      "A scored quiz on game development basics, with pass and retry endings that show the score.",
    document: {
      title: "Game development basics quiz",
      welcome: {
        eyebrow: "Quiz",
        title: "How well do you know game development?",
        body: rt("Eight questions on engines, loops and design. Score 6 or more to pass."),
        buttonLabel: "Start the quiz",
      },
      fields: [
        { id: "q_name", type: "short_text", label: "First, what's your name?", required: true },
        {
          id: "video_intro",
          type: "video",
          label: "Watch the two-minute recap first (optional)",
        },
        { id: "page_engines", type: "page_break", label: "", pageTitle: "Engines and loops" },
        {
          id: "q1",
          type: "multiple_choice",
          label: "What does a game loop do every frame, {{q_name}}?",
          required: true,
          options: scored("q1", [
            ["a", "Reads input, updates the state, renders", 1],
            ["b", "Loads every asset again", 0],
            ["c", "Saves the game to disk", 0],
          ]),
        },
        {
          id: "q2",
          type: "multiple_choice",
          label: "In Unity, which method runs at a fixed time step, best for physics?",
          required: true,
          options: scored("q2", [
            ["a", "Update()", 0],
            ["b", "FixedUpdate()", 1],
            ["c", "LateUpdate()", 0],
            ["d", "Start()", 0],
          ]),
        },
        {
          id: "q3",
          type: "multiple_choice",
          label: "Why multiply movement by delta time?",
          required: true,
          options: scored("q3", [
            ["a", "To make it frame-rate independent", 1],
            ["b", "To make it faster on slow devices", 0],
            ["c", "To save memory", 0],
          ]),
        },
        {
          id: "q4",
          type: "checkboxes",
          label: "Which of these are game engines? Choose all that apply.",
          required: true,
          options: scored("q4", [
            ["godot", "Godot", 1],
            ["unreal", "Unreal Engine", 1],
            ["figma", "Figma", -1],
            ["postgres", "PostgreSQL", -1],
          ]),
        },
        { id: "page_design", type: "page_break", label: "", pageTitle: "Design" },
        {
          id: "q5",
          type: "multiple_choice",
          label: "A playtest mostly helps you...",
          required: true,
          options: scored("q5", [
            ["a", "See how real players understand the game", 1],
            ["b", "Find the best price for the game", 0],
            ["c", "Choose the engine", 0],
          ]),
        },
        {
          id: "q6",
          type: "dropdown",
          label: "What is a sprite atlas for?",
          required: true,
          options: scored("q6", [
            ["a", "Packing many images into one texture", 1],
            ["b", "Mapping the game world", 0],
            ["c", "Storing save files", 0],
          ]),
        },
        {
          id: "q7",
          type: "yes_no",
          label: "True or false: a higher polygon count always makes a game look better.",
          required: true,
        },
        {
          id: "q8",
          type: "multiple_choice",
          label: "What does 'juice' mean in game feel?",
          required: true,
          options: scored("q8", [
            ["a", "Extra feedback like shake, sound and particles", 1],
            ["b", "The game's energy system", 0],
            ["c", "A type of shader", 0],
          ]),
        },
      ],
      endings: [
        {
          id: "ending_retry",
          title: "Nice try, {{q_name}}",
          body: rt("Review the recap and give it another go. You can retake the quiz any time."),
          showScore: true,
          allowAnother: true,
        },
        {
          id: "ending_pass",
          when: { match: "all", rules: [{ subject: "$score", operator: "gte", value: 6 }] },
          title: "You passed",
          body: rt("Great work. You know your game loops from your sprite atlases."),
          showScore: true,
          showShare: true,
        },
      ],
      design: {
        theme: "nebula",
        layout: "conversational",
        progress: "fraction",
        background: { scene: "constellation", intensity: "lively", pattern: "none", dim: 40 },
        motion: { entrance: "pop", celebration: "fireworks", sound: true },
      },
      settings: { scoring: { enabled: true, maxScore: 8 }, showQuestionNumbers: true },
    },
  },
  {
    id: "personality-quiz",
    name: "Personality quiz",
    category: "education",
    description:
      "Which lab role suits you? Points on each answer lead to one of three endings by score.",
    document: {
      title: "Which lab role suits you?",
      welcome: {
        eyebrow: "Personality quiz",
        title: "Maker, thinker or storyteller?",
        body: rt(
          "Six quick questions reveal which side of the lab fits you best. There are no wrong answers.",
        ),
        buttonLabel: "Find out",
      },
      fields: [
        {
          id: "q1",
          type: "picture_choice",
          label: "Pick a weekend project",
          required: true,
          optionLayout: "grid",
          maxSelections: 1,
          options: scored("q1", [
            ["build", "Building a tiny game", 3],
            ["study", "Interviewing players about a game", 1],
            ["story", "Writing a comic", 2],
          ]),
        },
        {
          id: "q2",
          type: "multiple_choice",
          label: "In a team, you usually...",
          required: true,
          options: scored("q2", [
            ["code", "Get the prototype running", 3],
            ["question", "Ask why we're building it", 1],
            ["pitch", "Pitch the idea to others", 2],
          ]),
        },
        {
          id: "q3",
          type: "multiple_choice",
          label: "Your favourite kind of problem is...",
          required: true,
          options: scored("q3", [
            ["tech", "A tricky bug", 3],
            ["people", "Why people behave the way they do", 1],
            ["mood", "How to make someone feel something", 2],
          ]),
        },
        {
          id: "q4",
          type: "multiple_choice",
          label: "Pick a tool",
          required: true,
          optionLayout: "inline",
          options: scored("q4", [
            ["ide", "Code editor", 3],
            ["notebook", "Notebook", 1],
            ["tablet", "Drawing tablet", 2],
          ]),
        },
        {
          id: "q5",
          type: "multiple_choice",
          label: "A perfect demo day ends with...",
          required: true,
          options: scored("q5", [
            ["fps", "A smooth 60 frames per second", 3],
            ["data", "Clear findings from a study", 1],
            ["cheer", "The audience laughing at the right moment", 2],
          ]),
        },
        {
          id: "q6",
          type: "multiple_choice",
          label: "Which would you read first?",
          required: true,
          options: scored("q6", [
            ["docs", "Engine documentation", 3],
            ["paper", "A research paper", 1],
            ["script", "A game script", 2],
          ]),
        },
      ],
      endings: [
        {
          id: "ending_thinker",
          title: "You're a thinker",
          body: rt(
            "Research and UX is your home: you ask the right questions and turn answers into insight.",
          ),
          showShare: true,
          allowAnother: true,
        },
        {
          id: "ending_maker",
          when: { match: "all", rules: [{ subject: "$score", operator: "gte", value: 15 }] },
          title: "You're a maker",
          body: rt(
            "You love building. Game and mobile development teams at the lab would welcome you.",
          ),
          showShare: true,
          allowAnother: true,
        },
        {
          id: "ending_storyteller",
          when: {
            match: "all",
            rules: [
              { subject: "$score", operator: "gte", value: 10 },
              { subject: "$score", operator: "lt", value: 15 },
            ],
          },
          title: "You're a storyteller",
          body: rt(
            "Narrative, art and multimedia bring your ideas to life. Try the lab's interactive media projects.",
          ),
          showShare: true,
          allowAnother: true,
        },
      ],
      design: {
        theme: "lavender",
        layout: "conversational",
        align: "center",
        font: "fraunces",
        background: { scene: "orbit", intensity: "wild", pattern: "none", dim: 40 },
        motion: { entrance: "pop", celebration: "confetti" },
      },
      settings: { scoring: { enabled: true }, showQuestionNumbers: false },
    },
  },
  {
    id: "lab-safety-quiz",
    name: "Lab orientation check",
    category: "education",
    description:
      "A short scored check new members pass before using the lab, with a retry path for low scores.",
    document: {
      title: "Lab orientation check",
      welcome: {
        eyebrow: "New member orientation",
        title: "Ready to use the lab?",
        body: rt(
          "Five questions on lab rules and equipment care. Answer at least four correctly to get your access.",
        ),
        buttonLabel: "Begin",
      },
      fields: [
        { id: "q_name", type: "name", label: "Your name", required: true },
        { id: "q_email", type: "email", label: "Email", required: true },
        { id: "page_rules", type: "page_break", label: "", pageTitle: "Lab rules" },
        {
          id: "q1",
          type: "multiple_choice",
          label: "You finish using a VR headset. What do you do?",
          required: true,
          options: scored("q1", [
            ["a", "Wipe it, charge it and log the return", 1],
            ["b", "Leave it on the desk for the next person", 0],
            ["c", "Take it home to charge", 0],
          ]),
        },
        {
          id: "q2",
          type: "multiple_choice",
          label: "Where do project files belong?",
          required: true,
          options: scored("q2", [
            ["a", "On the lab computer's desktop", 0],
            ["b", "In the team's shared repository or drive", 1],
            ["c", "On a USB stick", 0],
          ]),
        },
        {
          id: "q3",
          type: "checkboxes",
          label: "Which are allowed at the workstations?",
          required: true,
          options: scored("q3", [
            ["water", "Water in a closed bottle", 1],
            ["food", "Meals", -1],
            ["coffee", "Open cups of coffee", -1],
          ]),
        },
        {
          id: "q4",
          type: "multiple_choice",
          label: "Who do you tell when equipment breaks?",
          required: true,
          options: scored("q4", [
            ["a", "The lab assistant, the same day", 1],
            ["b", "Nobody, if it still sort of works", 0],
          ]),
        },
        {
          id: "q5",
          type: "multiple_choice",
          label: "The last person to leave the lab should...",
          required: true,
          options: scored("q5", [
            ["a", "Switch off the lights and AC and lock the door", 1],
            ["b", "Leave everything on for the morning", 0],
          ]),
        },
        {
          id: "q_confidence",
          type: "opinion_scale",
          label: "How confident do you feel about the lab rules now?",
          min: 1,
          max: 5,
          minLabel: "Unsure",
          maxLabel: "Confident",
        },
      ],
      endings: [
        {
          id: "ending_retry",
          title: "Almost there",
          body: rt("Read the lab handbook once more and retake the check."),
          showScore: true,
          allowAnother: true,
          showShare: false,
        },
        {
          id: "ending_pass",
          when: { match: "all", rules: [{ subject: "$score", operator: "gte", value: 4 }] },
          title: "Welcome to the lab",
          body: rt("You passed. The lab assistant will activate your access card this week."),
          showScore: true,
          showShare: false,
        },
      ],
      design: {
        theme: "grove",
        layout: "classic",
        progress: "fraction",
        background: { scene: "blocks", intensity: "calm", pattern: "none", dim: 40 },
        motion: { entrance: "rise", celebration: "assemble" },
      },
      settings: {
        scoring: { enabled: true },
        receipt: { enabled: true, emailFieldId: "q_email", subject: "Your lab orientation result" },
      },
    },
  },
];
