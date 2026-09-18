"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import gsap from "gsap";

import { fadeUpOnScroll } from "@/lib/scroll-reveal";
import { MonitorWindow } from "./monitor-window";
import { GrainOverlay } from "./grain-overlay";

function reducedMotion() {
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type TerminalLine = { id: number; kind: "input" | "output"; text: string };

const BOOT_LINES: readonly string[] = [
  "MGM Laboratory — Website focus terminal",
  "type 'help' to see what's here, or 'deploy' to see what happens after you push.",
];

const HELP_LINES: readonly string[] = [
  "available commands:",
  "  whoami   who's asking",
  "  stack    what's actually running here",
  "  deploy   ship something",
  "  logs     tail the last few lines",
  "  clear    clear the screen",
];

const WHOAMI_LINES: readonly string[] = [
  "you: a developer with a deadline and an opinion about tabs vs. spaces.",
  "we don't judge. much.",
];

const STACK_LINES: readonly string[] = [
  "plan       jira, figma, notion, ai agents",
  "design     figma, maze, framer",
  "build      claude, chatgpt, kimi, glm, local inference, elevenlabs",
  "watch      sentry, datadog, grafana, coderabbit, devin",
  "automate   n8n, meilisearch, waba, smtp routing",
  "reach      aws, gcp, azure, google apis, our own data center",
  "",
  "scroll up for the long version.",
];

const LOGS_LINES: readonly string[] = [
  "[web] GET / 200 41ms",
  "[api] GET /health 200 6ms",
  "[web] compiled successfully",
  "[it&infra] nothing on fire. as usual.",
];

const DEPLOY_LINES: readonly string[] = [
  "$ git push origin main",
  "lint ..................... ok",
  "typecheck ................ ok",
  "test ...................... ok",
  "build ...................... ok",
  "docker build (api, web) .... ok",
  "push to registry ............ ok",
  "railway: web .................. deployed",
  "railway: api ................... deployed",
  "live in ~30s.",
  "(this exact page redeploys the same way — nobody on the dev team touched a server.)",
];

// Matches enough destructive-sounding input to land the joke without being
// a real shell — this never executes anything, it only picks which fake
// response to print.
const DANGEROUS_PATTERN = /rm\s+-rf|sudo|format\s|drop\s+table|:\(\)\s*\{/i;

const GUARDRAIL_LINES: readonly string[] = [
  "permission denied.",
  "that's exactly why there's a whole IT & Infra division standing between you and the servers.",
  "try 'deploy' instead.",
];

function Terminal() {
  const [lines, setLines] = useState<TerminalLine[]>(() =>
    BOOT_LINES.map((text, i) => ({ id: i, kind: "output", text })),
  );
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(BOOT_LINES.length);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);
  const scanlineRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useLayoutEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  useLayoutEffect(() => {
    const el = scanlineRef.current;
    if (!el || reducedMotion()) return undefined;
    const tween = gsap.to(el, {
      opacity: 0.55,
      duration: 2.2,
      ease: "sine.inOut",
      repeat: -1,
      yoyo: true,
    });
    return () => {
      tween.kill();
    };
  }, []);

  function appendLine(kind: TerminalLine["kind"], text: string) {
    const id = nextId.current++;
    setLines((prev) => [...prev, { id, kind, text }]);
  }

  async function typeOut(newLines: readonly string[]) {
    setBusy(true);
    const reduced = reducedMotion();
    for (const text of newLines) {
      if (cancelledRef.current) return;
      await sleep(reduced ? 0 : 110);
      if (cancelledRef.current) return;
      appendLine("output", text);
    }
    setBusy(false);
  }

  async function runCommand(raw: string) {
    const trimmed = raw.trim();
    const cmd = trimmed.toLowerCase();

    if (cmd === "clear") {
      setLines([]);
      return;
    }
    if (DANGEROUS_PATTERN.test(cmd)) {
      await typeOut(GUARDRAIL_LINES);
      return;
    }
    switch (cmd) {
      case "":
        return;
      case "help":
        await typeOut(HELP_LINES);
        return;
      case "whoami":
        await typeOut(WHOAMI_LINES);
        return;
      case "stack":
        await typeOut(STACK_LINES);
        return;
      case "logs":
        await typeOut(LOGS_LINES);
        return;
      case "deploy":
        await typeOut(DEPLOY_LINES);
        return;
      default:
        await typeOut([`command not found: ${trimmed}`, "try 'help'."]);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (busy) return;
      const raw = value;
      if (raw.trim().length) {
        appendLine("input", `$ ${raw}`);
        setHistory((h) => [...h, raw]);
      }
      setHistoryIndex(-1);
      setValue("");
      void runCommand(raw);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!history.length) return;
      const next = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(next);
      setValue(history[next] ?? "");
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (historyIndex === -1) return;
      const next = historyIndex + 1;
      if (next >= history.length) {
        setHistoryIndex(-1);
        setValue("");
      } else {
        setHistoryIndex(next);
        setValue(history[next] ?? "");
      }
    }
  }

  return (
    <div
      className="relative cursor-text bg-black/60 p-5 font-mono text-[13px] leading-relaxed text-white/85 sm:p-6 sm:text-sm"
      onClick={() => inputRef.current?.focus()}
    >
      <div
        ref={scanlineRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 3px)",
        }}
      />
      <div
        ref={outputRef}
        role="log"
        aria-live="polite"
        className="relative max-h-64 overflow-y-auto pr-1"
      >
        {lines.map((line) => (
          <p
            key={line.id}
            className={
              line.kind === "input" ? "text-brand-yellow" : "whitespace-pre-wrap text-white/75"
            }
          >
            {line.text || " "}
          </p>
        ))}
      </div>
      <div className="relative mt-2 flex items-center gap-2">
        <span className="text-brand-yellow" aria-hidden="true">
          $
        </span>
        <label htmlFor="ship-terminal-input" className="sr-only">
          Terminal command input
        </label>
        <input
          id="ship-terminal-input"
          ref={inputRef}
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-white caret-brand-yellow outline-none placeholder:text-white/30"
          placeholder="try 'help'"
        />
      </div>
    </div>
  );
}

export function ShipTerminal() {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tween = fadeUpOnScroll(root, ".reveal-card", { stagger: 0.1 });
    return () => tween?.scrollTrigger?.kill();
  }, []);

  return (
    <section className="relative overflow-hidden bg-[var(--surface-inverse)] px-6 py-24 text-white sm:px-10 sm:py-32 lg:px-16">
      <noscript>
        <style>{".reveal-card{opacity:1 !important}"}</style>
      </noscript>
      <div className="absolute inset-0">
        <Image
          src="/focus/website/photos/moody-code.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
        />
        {/* Heavier than a typical legibility wash on purpose — the source
            photo's code is Python/ML, not web tooling, so it needs to read
            as ambient dark texture rather than literal, readable content. */}
        <div className="absolute inset-0 bg-[var(--surface-inverse)]/80" />
      </div>
      <GrainOverlay className="opacity-[0.07]" />
      <div ref={rootRef} className="relative mx-auto max-w-3xl">
        <p className="reveal-card font-mono text-xs font-semibold tracking-wide text-brand-yellow uppercase opacity-0">
          Ship it
        </p>
        <h2 className="reveal-card mt-4 font-display text-[clamp(2.25rem,5vw,4rem)] leading-[0.98] font-semibold tracking-tight opacity-0">
          The only part you don&apos;t have to build.
        </h2>
        <p className="reveal-card mt-5 max-w-xl text-white/65 opacity-0">
          MGM has a dedicated IT &amp; Infrastructure division, so &quot;deployment,&quot;
          &quot;scaling,&quot; and &quot;did the build even pass&quot; are someone else&apos;s
          problem the moment you push — checked by CI, shipped as containers, live on Railway in
          about 30 seconds. Don&apos;t take our word for it — type below.
        </p>

        <div className="reveal-card mt-8 opacity-0">
          <MonitorWindow url="ship.mgmlab.dev" dark>
            <Terminal />
          </MonitorWindow>
        </div>
      </div>
    </section>
  );
}
