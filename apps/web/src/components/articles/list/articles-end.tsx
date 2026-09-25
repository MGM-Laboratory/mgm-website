"use client";

import Link from "next/link";
import { House } from "lucide-react";
import { useEffect, useRef } from "react";

import type { ArticlesWorldApi } from "@/components/articles/world/world-api";
import { onWorldState } from "@/components/articles/world/world-registry";
import { LEGAL_LINKS } from "@/data/nav";

/**
 * The absolute bottom of the list, where the archive runs out. There is no
 * footer: a line saying the visitor has reached the end (and how much there
 * was), a big floating Home button, and the legal links (the only ones on
 * this page).
 *
 * With the world running, the Home button is a 3D pill the world draws
 * (world/home/home-layer.ts, loaded only once the end is near) exactly over
 * this real link, which stays for the keyboard, screen readers and the
 * pointer. Without it, the link is the button (articles.css). It comes
 * after the header logo in the DOM, which stays the page's first link home.
 */
export function ArticlesEnd({
  category,
  empty,
  q,
  total,
}: {
  category?: string;
  empty: boolean;
  q?: string;
  total: number;
}) {
  const homeRef = useRef<HTMLAnchorElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const home = homeRef.current;
    const section = sectionRef.current;
    if (!home || !section) return;
    let cancelled = false;
    let removeLayer: (() => void) | null = null;
    let near = false;
    let world: ArticlesWorldApi | null = null;

    const attach = () => {
      if (!near || !world || removeLayer || cancelled) return;
      const current = world;
      void import("@/components/articles/world/home/home-layer").then(({ HomeLayer }) => {
        if (cancelled || removeLayer || current !== world) return;
        const layer = new HomeLayer(current, home);
        removeLayer = current.addLayer(layer, 50);
        home.dataset.homeGl = "";
      });
    };
    const detach = () => {
      removeLayer?.();
      removeLayer = null;
      delete home.dataset.homeGl;
    };

    // The pill's module loads only when the end is within a couple of screens.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        near = true;
        observer.disconnect();
        attach();
      },
      { rootMargin: "0px 0px 200% 0px" },
    );
    observer.observe(section);
    const offWorld = onWorldState((_mode, next) => {
      if (next === world) return;
      detach();
      world = next;
      attach();
    });
    return () => {
      cancelled = true;
      observer.disconnect();
      offWorld();
      detach();
    };
  }, []);

  const count = `${total} ${total === 1 ? "article" : "articles"}`;
  const copy = q
    ? {
        kicker: "End of the results",
        title: `That's everything matching “${q}”`,
        count: category ? `${count} in ${category}.` : `${count} in the archive.`,
      }
    : category
      ? {
          kicker: `End of ${category}`,
          title: "You've reached the end of this shelf",
          count: `${count} in ${category}, from the newest back to the first.`,
        }
      : {
          kicker: "End of the archive",
          title: "You've reached the end of the archive",
          count: `All ${count}, from the newest back to the very first.`,
        };

  return (
    <section
      aria-label="End of the archive"
      className="articles-end"
      data-articles-end=""
      ref={sectionRef}
    >
      {empty ? null : (
        <div className="articles-end-copy">
          <p className="articles-end-kicker">{copy.kicker}</p>
          <p className="articles-end-title">{copy.title}</p>
          <p className="articles-end-count">{copy.count}</p>
        </div>
      )}
      <div className="articles-home-stage">
        <Link
          aria-label="Home"
          className="articles-home"
          data-articles-home=""
          href="/"
          ref={homeRef}
        >
          <span aria-hidden="true" className="articles-home-face">
            <House className="articles-home-icon" strokeWidth={2.25} />
            <span className="articles-home-label">Home</span>
          </span>
        </Link>
      </div>
      <nav aria-label="Legal" className="articles-legal">
        {LEGAL_LINKS.map((link) => (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}
