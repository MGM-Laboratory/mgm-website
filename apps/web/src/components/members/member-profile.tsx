"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  BriefcaseBusiness,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import gsap from "gsap";
import { type ReactNode, useLayoutEffect, useRef } from "react";

import type { Member } from "@/data/members";

const ACCENT_COLORS = {
  blue: "bg-brand-blue",
  yellow: "bg-brand-yellow",
  red: "bg-brand-red",
  green: "bg-brand-green",
} as const;

function ProfilePortrait({ member }: { member: Member }) {
  const initials = member.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <div className="profile-portrait relative aspect-[4/5] overflow-hidden bg-brand-blue-50 dark:bg-[#1b2944]">
      <div
        aria-hidden="true"
        className={`absolute -right-[22%] -top-[12%] size-[74%] rounded-full ${ACCENT_COLORS[member.accent]}`}
      />
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 size-[37%] border-l-[22px] border-t-[22px] border-white/70 dark:border-white/10"
      />
      <div
        aria-hidden="true"
        className="absolute right-0 top-0 h-[58%] w-[22%] bg-[var(--ink)]/90 dark:bg-white/15"
      />
      {member.hasPortrait ? (
        <Image
          src={`/members/${member.slug}.webp`}
          alt={`Portrait of ${member.name}`}
          fill
          sizes="(max-width: 1023px) 100vw, 42vw"
          className="object-contain object-bottom"
        />
      ) : (
        <span className="absolute inset-x-0 bottom-12 text-center font-display text-8xl font-semibold tracking-tighter text-[var(--ink)]/80 dark:text-white/80">
          {initials}
        </span>
      )}
      <span className="absolute bottom-6 left-6 font-mono text-[11px] tracking-[0.16em] text-[var(--ink)]/55 uppercase dark:text-white/55">
        MGM Laboratory
      </span>
    </div>
  );
}

function ProfileSection({
  icon: Icon,
  title,
  children,
}: {
  children: ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <section className="border-t border-[var(--line)] py-9 first:border-t-0 first:pt-0 dark:border-white/10">
      <div className="flex items-center gap-3">
        <Icon size={19} strokeWidth={2.25} className="text-brand-blue" />
        <h2 className="font-display text-xl font-semibold tracking-tight text-[var(--ink)] dark:text-white">
          {title}
        </h2>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function MemberProfile({ member }: { member: Member }) {
  const root = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targets = element.querySelectorAll<HTMLElement>(".profile-reveal");
    if (reducedMotion) {
      gsap.set(targets, { opacity: 1, y: 0 });
      return;
    }
    const context = gsap.context(() => {
      gsap.fromTo(
        targets,
        { opacity: 0, y: 28 },
        { opacity: 1, y: 0, duration: 0.72, ease: "power3.out", stagger: 0.11 },
      );
    }, element);
    return () => context.revert();
  }, []);

  return (
    <main ref={root} className="px-5 pb-20 pt-28 sm:px-8 sm:pt-32 lg:px-12 lg:pb-28">
      <div className="mx-auto max-w-[1280px]">
        <Link
          href="/member"
          className="profile-reveal inline-flex items-center gap-2 text-sm font-medium text-[var(--ink-2)] transition-colors hover:text-brand-blue focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none dark:text-white/65 dark:hover:text-brand-blue"
        >
          <ArrowLeft size={18} strokeWidth={2.25} />
          All members
        </Link>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(20rem,0.82fr)_minmax(0,1.18fr)] lg:gap-20">
          <div className="profile-reveal self-start lg:sticky lg:top-24">
            <ProfilePortrait member={member} />
          </div>
          <div className="min-w-0 pt-1">
            <p className="profile-reveal font-mono text-xs tracking-[0.16em] text-brand-blue uppercase">
              {member.division}
            </p>
            <h1 className="profile-reveal mt-3 font-display text-[clamp(2.75rem,6vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.05em] text-[var(--ink)] dark:text-white">
              {member.name}
            </h1>
            <p className="profile-reveal mt-4 text-lg font-medium text-brand-blue">{member.role}</p>
            <p className="profile-reveal mt-7 max-w-2xl text-lg leading-8 text-[var(--ink-2)] dark:text-white/70">
              {member.bio}
            </p>

            <div className="profile-reveal mt-10 flex flex-wrap gap-2">
              {member.labFocus.map((focus) => (
                <span
                  key={focus}
                  className="rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-sm text-[var(--ink-2)] dark:border-white/15 dark:text-white/70"
                >
                  {focus}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="profile-reveal mt-20 grid gap-x-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-y-0">
          <div className="lg:border-r lg:border-[var(--line)] lg:pr-14 dark:border-white/10">
            <ProfileSection icon={Sparkles} title="Lab focus">
              <p className="max-w-md text-sm leading-6 text-[var(--ink-2)] dark:text-white/65">
                This public profile reflects the member&apos;s MGM Laboratory division. Individual
                stack preferences will be published with the future CMS profile.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {member.labFocus.map((focus) => (
                  <span
                    key={focus}
                    className="rounded-full bg-brand-blue-50 px-3 py-1.5 text-sm font-medium text-[var(--ink)] dark:bg-brand-blue/20 dark:text-white"
                  >
                    {focus}
                  </span>
                ))}
              </div>
            </ProfileSection>
            <ProfileSection icon={BookOpen} title="Education">
              <p className="text-sm leading-6 text-[var(--ink-2)] dark:text-white/65">
                Education details have not been published for this profile yet.
              </p>
            </ProfileSection>
          </div>

          <div className="lg:pl-14">
            <ProfileSection icon={BriefcaseBusiness} title="Experience">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="font-medium text-[var(--ink)] dark:text-white">MGM Laboratory</p>
                  <p className="mt-1 text-sm text-[var(--ink-2)] dark:text-white/65">
                    {member.role} · {member.division}
                  </p>
                </div>
                <span className="font-mono text-xs text-brand-blue">Current roster</span>
              </div>
              <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--ink-2)] dark:text-white/65">
                The public roster records this member&apos;s laboratory division. Their full
                experience history will be available once it is published through the CMS.
              </p>
            </ProfileSection>
            <ProfileSection icon={BadgeCheck} title="Achievements">
              <p className="text-sm leading-6 text-[var(--ink-2)] dark:text-white/65">
                No achievements have been published for this profile yet.
              </p>
            </ProfileSection>
            <Link
              href="/contact"
              className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-brand-blue transition-colors hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:outline-none dark:hover:text-white"
            >
              Contact MGM Laboratory
              <ArrowUpRight size={17} strokeWidth={2.25} />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
