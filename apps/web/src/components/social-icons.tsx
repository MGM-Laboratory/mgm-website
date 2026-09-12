import type { Ref } from "react";

// lucide-react in this repo ships no brand/logo icons (Instagram, LinkedIn,
// etc. were dropped upstream) — drawn inline instead. All `currentColor`,
// so they track whatever text color the caller sets (and so flip with
// light/dark mode for free, same as any other icon in the app). Each also
// takes a `ref` (React 19 supports this directly on function components,
// no forwardRef needed) so a caller can GSAP-animate the actual svg node —
// used for the nav panel's per-icon hover wiggle.

export type GlyphProps = { className?: string; ref?: Ref<SVGSVGElement> };

export function InstagramGlyph({ className, ref }: GlyphProps) {
  return (
    <svg ref={ref} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.25" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.25" cy="6.75" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function LinkedinGlyph({ className, ref }: GlyphProps) {
  return (
    <svg ref={ref} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="9" width="4" height="12" fill="currentColor" />
      <circle cx="5" cy="4.5" r="2.25" fill="currentColor" />
      <path
        d="M11 21V9h4v1.8c.9-1.3 2.3-2 4-2 3 0 5 2 5 5.5V21h-4v-6c0-1.5-.8-2.5-2.2-2.5S15 13.5 15 15v6z"
        fill="currentColor"
      />
    </svg>
  );
}

export function GithubGlyph({ className, ref }: GlyphProps) {
  return (
    <svg ref={ref} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M9 19.4C5.5 20.5 5.5 17.5 4.1 17M13.9 21V18.2C13.9 17.4 14.2 16.7 14.7 16.2C11 15.8 7.1 14.4 7.1 8.1C7.1 6.5 7.7 5.1 8.6 4C8.3 3.2 8.2 2 8.7 1C8.7 1 10.1 0.6 13 2.5C15.5 1.8 18.2 1.8 20.7 2.5C23.6 0.6 25 1 25 1C25.5 2 25.4 3.2 25.1 4C26 5.1 26.6 6.5 26.6 8.1C26.6 14.4 22.7 15.8 19 16.2C19.5 16.7 19.8 17.5 19.8 18.5V21"
        transform="translate(-3.4 1) scale(.83)"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function XGlyph({ className, ref }: GlyphProps) {
  return (
    <svg ref={ref} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M5 4L19 20M19 4L5 20"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function YoutubeGlyph({ className, ref }: GlyphProps) {
  return (
    <svg ref={ref} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M10 9L15.5 12L10 15V9Z" fill="currentColor" />
    </svg>
  );
}

export function DiscordGlyph({ className, ref }: GlyphProps) {
  return (
    <svg ref={ref} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M8 6C5 6 3.5 8.5 3.5 12.5C3.5 16 5 18 8 18.5L8.8 17C6.9 16.5 6 15.5 6 15.5C6.3 15.7 6.8 16 7.5 16.2C9 16.7 10.6 16.9 12 16.9C13.4 16.9 15 16.7 16.5 16.2C17.2 16 17.7 15.7 18 15.5C18 15.5 17.1 16.5 15.2 17L16 18.5C19 18 20.5 16 20.5 12.5C20.5 8.5 19 6 16 6C16 6 15.4 6.7 15 7.3C13.7 7 10.3 7 9 7.3C8.6 6.7 8 6 8 6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="12.5" r="1.2" fill="currentColor" />
      <circle cx="14.5" cy="12.5" r="1.2" fill="currentColor" />
    </svg>
  );
}
