"use client";

import { ArrowRight, ArrowUpRight, ChevronsRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { DetailController } from "@/components/projects/detail/detail-controller";
import { DetailCta } from "@/components/projects/detail/detail-cta";
import type {
  DetailCredit,
  DetailData,
  DetailLink,
  DetailMediaItem,
} from "@/components/projects/detail/detail-data";
import { DetailMedia, mediaAspect } from "@/components/projects/detail/detail-media";
import {
  clearNextArrival,
  isNextArrival,
  noteNextArrival,
} from "@/components/projects/detail/detail-session";
import { ProjectTopography } from "@/components/projects/detail/topography";
import { useSiteScheme } from "@/components/projects/detail/use-site-scheme";
import { PROJECT_THEMES, projectThemeCss } from "@/lib/project-themes";
import { cn } from "@/lib/utils";

import styles from "./project-detail.module.css";

/** Lists longer than this collapse behind a "+N more" button. */
const LIST_LIMIT = 6;

// Without JavaScript the page uses the stacked layout at every width, with
// everything visible (the horizontal layout needs the scroll mapping).
const NO_SCRIPT_CSS = `
[data-project-detail] [data-enter],[data-project-detail] [data-detail-item] :is(img,video){opacity:1!important}
@media (width>812px){
[data-project-detail]{padding:0 var(--pad-x)!important}
[data-project-detail] [data-detail-spacer],[data-project-detail] [data-detail-hint]{display:none!important}
[data-project-detail] [data-detail-stage]{position:relative!important;inset:auto!important;height:auto!important;overflow:visible!important}
[data-project-detail] [data-detail-meta]{position:relative!important;inset:auto!important;width:auto!important;max-width:56rem;transform:none!important;padding:calc(64px + 10vh) 0 50px!important;pointer-events:auto!important}
[data-project-detail] [data-detail-track]{position:static!important;display:flex!important;flex-direction:column!important;gap:50px!important;width:auto!important;height:auto!important;padding:0 0 50px!important}
[data-project-detail] [data-detail-item]{height:auto!important;margin:0!important;width:100%!important}
[data-project-detail] [data-detail-next]{position:relative!important;inset:auto!important;transform:none!important;margin:0 calc(var(--pad-x)*-1)!important;padding:4vh var(--pad-x)!important}
[data-project-detail] [data-detail-next] > *{position:relative!important;inset:auto!important;transform:none!important;width:auto!important;margin-top:4vh}
}`;

/** The spacer's height in CSS, so the page is already the track's length
 *  before JavaScript measures it (and reload scroll restoration lands). */
function travelHeight(media: DetailMediaItem[]) {
  if (!media.length) return "100dvh";
  let normal = 0;
  let full = 0;
  for (const item of media) {
    if (item.full) full += mediaAspect(item);
    else normal += mediaAspect(item);
  }
  const gaps = media.length - 1;
  return `max(100dvh, calc(48em + var(--band-h) * ${normal.toFixed(4)} + 100dvh * ${full.toFixed(4)} + 5em * ${gaps} + 35vw - 100vw + 100dvh))`;
}

function ExternalMark() {
  return (
    <ArrowUpRight aria-hidden="true" className={styles.external} size="0.9em" strokeWidth={2.25} />
  );
}

function Collapsible<T>({
  items,
  render,
  noun,
  className,
}: {
  items: T[];
  render(item: T, index: number): ReactNode;
  noun: string;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const overflow = items.length > LIST_LIMIT;
  const shown = overflow && !open ? items.slice(0, LIST_LIMIT - 1) : items;
  const hidden = items.length - (LIST_LIMIT - 1);
  return (
    <>
      <ul className={className} id={listId}>
        {shown.map((item, index) => render(item, index))}
      </ul>
      {overflow ? (
        <button
          aria-controls={listId}
          aria-expanded={open}
          className={styles.more}
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? "Show fewer" : `+${hidden} more`}
          <span className={styles.srOnly}> {noun}</span>
        </button>
      ) : null}
    </>
  );
}

function LinkItem({ link }: { link: DetailLink }) {
  return (
    <li>
      <a
        className={styles.listLink}
        href={link.href}
        rel={link.external ? "noopener noreferrer" : undefined}
        target={link.external ? "_blank" : undefined}
      >
        {link.label}
        {link.external ? (
          <>
            <ExternalMark />
            <span className={styles.srOnly}> (opens in a new tab)</span>
          </>
        ) : null}
      </a>
    </li>
  );
}

function CreditItem({ credit }: { credit: DetailCredit }) {
  return (
    <li>
      <span className={styles.creditName}>{credit.name}</span>
      {credit.role ? <span className={styles.creditRole}>{credit.role}</span> : null}
    </li>
  );
}

export function ProjectDetail({ data }: { data: DetailData }) {
  const router = useRouter();
  const scheme = useSiteScheme();
  const palette = PROJECT_THEMES[data.themeId][scheme];
  const next = data.next;
  const nextHref = next ? `/projects/${next.slug}` : undefined;

  const [media, setMedia] = useState(data.media);
  const mediaRef = useRef(media);
  // Read while rendering, so the first frame already matches the hand-off.
  const [arrived] = useState(() => isNextArrival(data.slug));
  const controllerRef = useRef<DetailController | null>(null);
  const navigateTimer = useRef(0);

  const stageRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const panelRef = useRef<HTMLAnchorElement>(null);
  const panelTitleRef = useRef<HTMLSpanElement>(null);
  const panelFooterRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const wipeRef = useRef<HTMLDivElement>(null);
  const wipeTitleRef = useRef<HTMLParagraphElement>(null);

  const navigateNext = useCallback(() => {
    if (!next || !nextHref) return;
    noteNextArrival(next.slug);
    router.push(nextHref);
    // A navigation that never lands (offline, a failed payload) still
    // leaves this page instead of stranding the covered screen.
    window.clearTimeout(navigateTimer.current);
    navigateTimer.current = window.setTimeout(() => window.location.assign(nextHref), 8000);
  }, [next, nextHref, router]);

  const prefetchNext = useCallback(() => {
    if (nextHref) router.prefetch(nextHref);
  }, [nextHref, router]);

  // One controller per page instance (the page is keyed by slug). Created
  // in a layout effect so the arrival frame is right before the first paint.
  useLayoutEffect(() => {
    const need = <T,>(value: T | null) => value as T;
    const controller = new DetailController({
      slug: data.slug,
      arrived,
      palette,
      nextThemeId: next?.themeId,
      onNavigateNext: navigateNext,
      onPrefetchNext: prefetchNext,
      elements: {
        stage: need(stageRef.current),
        gl: need(glRef.current),
        spacer: need(spacerRef.current),
        track: need(trackRef.current),
        meta: need(metaRef.current),
        body: bodyRef.current,
        title: need(titleRef.current),
        hint: hintRef.current,
        panel: panelRef.current,
        panelTitle: panelTitleRef.current,
        panelFooter: panelFooterRef.current,
        bar: barRef.current,
        wipe: wipeRef.current,
        wipeTitle: wipeTitleRef.current,
      },
    });
    controllerRef.current = controller;
    controller.start();
    clearNextArrival(data.slug);
    const timer = navigateTimer;
    return () => {
      window.clearTimeout(timer.current);
      controller.dispose();
      controllerRef.current = null;
    };
    // The page remounts per project (keyed by slug); the callbacks and the
    // palette reach the controller through their own paths below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    controllerRef.current?.setPalette(palette);
  }, [palette]);

  // Media sizes arriving (or files failing) change the layout: keep the
  // visitor's place while it reflows.
  useLayoutEffect(() => {
    mediaRef.current = media;
    controllerRef.current?.relayout();
  }, [media]);

  const onSize = useCallback((id: string, width: number, height: number) => {
    const item = mediaRef.current.find((entry) => entry.id === id);
    if (!item || !width || !height) return;
    if (item.width && item.height && Math.abs(item.width / item.height - width / height) < 0.005) {
      return;
    }
    controllerRef.current?.captureAnchor();
    setMedia((list) =>
      list.map((entry) => (entry.id === id ? { ...entry, width, height } : entry)),
    );
  }, []);

  const onFail = useCallback((id: string) => {
    if (!mediaRef.current.some((entry) => entry.id === id)) return;
    controllerRef.current?.captureAnchor();
    setMedia((list) => list.filter((entry) => entry.id !== id));
  }, []);

  const getMotion = useCallback(
    () => controllerRef.current?.motion() ?? { scroll: 0, velocity: 0 },
    [],
  );

  const nextCss = useMemo(
    () => (next ? projectThemeCss(next.themeId, "[data-next-world]") : ""),
    [next],
  );

  const spacerStyle = { height: travelHeight(media) } as CSSProperties;
  const titleStyle = arrived ? ({ opacity: 1 } as CSSProperties) : undefined;
  const hasRight = data.services.length > 0 || data.links.length > 0;

  return (
    <div
      className={styles.root}
      data-project-cover={data.coverUrl}
      data-project-detail=""
      data-project-slug={data.slug}
      data-project-theme={data.themeId}
    >
      {nextCss ? <style>{nextCss}</style> : null}
      <ProjectTopography className={styles.topography} getMotion={getMotion} palette={palette} />
      <div
        aria-hidden="true"
        className={styles.spacer}
        data-detail-spacer=""
        ref={spacerRef}
        style={spacerStyle}
      />

      <div className={styles.stage} data-detail-stage="" ref={stageRef}>
        <div aria-hidden="true" className={styles.gl} ref={glRef} />

        <div className={styles.meta} data-detail-meta="" ref={metaRef}>
          <h1
            className={cn(styles.titleType, styles.title, !arrived && styles.titleEnter)}
            data-enter=""
            ref={titleRef}
            style={titleStyle}
          >
            {data.title}
          </h1>
          <div className={styles.body} data-body="" ref={bodyRef}>
            <div className={styles.left}>
              {data.paragraphs.length ? (
                <div
                  className={cn(styles.desc, "motion-safe:opacity-0")}
                  data-enter=""
                  data-part="desc"
                >
                  {data.paragraphs.map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              ) : null}
              {data.cta ? (
                <div className="motion-safe:opacity-0" data-enter="" data-part="cta">
                  <DetailCta cta={data.cta} />
                </div>
              ) : null}
              {data.credits.length ? (
                <section
                  aria-labelledby={`${data.slug}-credits`}
                  className={cn(styles.credits, "motion-safe:opacity-0")}
                  data-enter=""
                  data-part="credits"
                >
                  <h2 className={styles.groupTitle} id={`${data.slug}-credits`}>
                    Credits
                  </h2>
                  <Collapsible
                    className={styles.creditList}
                    items={data.credits}
                    noun="credits"
                    render={(credit, index) => <CreditItem credit={credit} key={index} />}
                  />
                </section>
              ) : null}
            </div>
            {hasRight ? (
              <div className={styles.right}>
                {data.services.length ? (
                  <section
                    aria-labelledby={`${data.slug}-services`}
                    className={cn(styles.group, "motion-safe:opacity-0")}
                    data-enter=""
                    data-part="services"
                  >
                    <h2 className={styles.groupTitle} id={`${data.slug}-services`}>
                      Services
                    </h2>
                    <ul className={styles.list}>
                      {data.services.map((service) => (
                        <li key={service}>{service}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {data.links.length ? (
                  <section
                    aria-labelledby={`${data.slug}-links`}
                    className={cn(styles.group, "motion-safe:opacity-0")}
                    data-enter=""
                    data-part="links"
                  >
                    <h2 className={styles.groupTitle} id={`${data.slug}-links`}>
                      Links
                    </h2>
                    <Collapsible
                      className={styles.list}
                      items={data.links}
                      noun="links"
                      render={(link) => <LinkItem key={link.href} link={link} />}
                    />
                  </section>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <section
          aria-label={`${data.title} media`}
          className={cn(styles.track, "motion-safe:opacity-0")}
          data-detail-track=""
          data-enter=""
          ref={trackRef}
        >
          {media.map((item, index) => (
            <DetailMedia index={index} item={item} key={item.id} onFail={onFail} onSize={onSize} />
          ))}
        </section>

        <p
          aria-hidden="true"
          className={cn(styles.hint, "motion-safe:opacity-0")}
          data-detail-hint=""
          data-enter=""
          ref={hintRef}
        >
          Scroll to explore
          <ChevronsRight strokeWidth={2.25} />
        </p>

        {next && nextHref ? (
          <Link
            aria-label={`Next project: ${next.title}`}
            className={styles.next}
            data-detail-next=""
            data-next-world=""
            href={nextHref}
            prefetch
            ref={panelRef}
          >
            <span aria-hidden="true" className={styles.nextTitleBox}>
              <span className={cn(styles.titleType, styles.nextTitle, "block")} ref={panelTitleRef}>
                {next.title}
              </span>
            </span>
            <span
              aria-hidden="true"
              className={cn(styles.nextFooter, "motion-safe:opacity-0")}
              data-enter=""
              ref={panelFooterRef}
            >
              <span className={styles.nextLabel}>Next project</span>
              <span className={styles.nextBar}>
                <span className={styles.nextBarFill} ref={barRef} />
              </span>
              <ArrowRight className={styles.nextArrow} strokeWidth={2.25} />
            </span>
          </Link>
        ) : null}
      </div>

      {next ? (
        <div aria-hidden="true" className={styles.wipe} data-next-world="" ref={wipeRef}>
          <p className={cn(styles.titleType, styles.wipeTitle)} ref={wipeTitleRef}>
            {next.title}
          </p>
        </div>
      ) : null}

      <noscript>
        <style>{NO_SCRIPT_CSS}</style>
      </noscript>
    </div>
  );
}
