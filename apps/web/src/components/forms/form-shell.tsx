"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { FormDesign } from "@repo/shared";

import { LogoMark } from "@/components/hero/shapes";
import type { ProjectColorScheme } from "@/lib/project-themes";

import { FormBackdrop } from "./form-backdrop";
import { FormRoot, useFormScheme } from "./form-root";
import type { SceneBus } from "./scene/bus";

/**
 * The frame every form screen shares: the themed root, the backdrop and
 * scene, a slim top bar (the lab's mark, the progress, the sound toggle)
 * and the main landmark.
 */
export function FormShell({
  slug,
  design,
  forced,
  stage,
  progress = 0,
  complete = false,
  bus,
  topbar,
  children,
  preview,
}: {
  slug: string;
  design: FormDesign;
  forced?: ProjectColorScheme;
  stage: "welcome" | "form" | "ending" | "status";
  progress?: number;
  complete?: boolean;
  bus?: SceneBus;
  topbar?: ReactNode;
  children: ReactNode;
  preview?: boolean;
}) {
  const scheme = useFormScheme(design.colorMode, forced);
  return (
    <FormRoot design={design} forced={forced} stage={stage}>
      <FormBackdrop
        slug={slug}
        design={design}
        scheme={scheme}
        progress={progress}
        complete={complete}
        stage={stage}
        bus={bus}
      />
      <div className="fx-shell">
        <header className="fx-topbar">
          {design.showLogo ? (
            preview ? (
              <span className="fx-logo" aria-label="MGM Laboratory">
                <LogoMark solid className="fx-logo-mark" />
              </span>
            ) : (
              <Link href="/" className="fx-logo" aria-label="MGM Laboratory home">
                <LogoMark solid className="fx-logo-mark" />
                <span className="fx-logo-word">MGM Laboratory</span>
              </Link>
            )
          ) : (
            <span />
          )}
          {topbar}
        </header>
        <main className="fx-main" id="fx-main">
          {children}
        </main>
      </div>
    </FormRoot>
  );
}
