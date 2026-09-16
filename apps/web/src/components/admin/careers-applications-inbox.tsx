"use client";

import { ArrowSquareOut, DownloadSimple, FileText } from "@phosphor-icons/react";
import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { toast } from "sonner";

import type { CmsJobApplicationRecord } from "@/lib/career-cms";
import {
  formatSubmittedDate,
  ResourceInboxShell,
  useResourceInbox,
} from "@/components/admin/resource-inbox";

const EMPTY_MESSAGES = {
  all: "No applications yet. They land here the moment someone applies.",
  archived: "Nothing archived yet.",
  unread: "Everything is read. Nice.",
};

const APPLICANT_BADGE: Record<string, string> = {
  "ub-student": "bg-brand-blue-50 text-brand-blue dark:bg-brand-blue/20 dark:text-[#9db8e8]",
  general: "bg-brand-green-50 text-brand-green dark:bg-brand-green/20 dark:text-[#6fd3a5]",
};

/**
 * The signed CV URL isn't part of the list payload, so it's fetched lazily
 * per selection. Keyed by slug at the call site so switching applications
 * remounts this (and resets to the loading state) instead of needing an
 * effect that resets state synchronously.
 */
function CvDownload({
  slug,
  cvFilename,
  cvContentType,
}: Readonly<{ slug: string; cvFilename: string; cvContentType: string }>) {
  const [state, setState] = useState<{ busy: boolean; url: string | null }>({
    busy: true,
    url: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let result: { url: string | null; errorMsg?: string };
      try {
        const response = await fetch(`/api/admin/applications/${encodeURIComponent(slug)}`);
        if (!response.ok) throw new Error(`The API answered ${response.status}.`);
        const payload = (await response.json()) as { cvUrl?: string | null };
        result = { url: payload.cvUrl ?? null };
      } catch (error) {
        result = { url: null, errorMsg: error instanceof Error ? error.message : undefined };
      } finally {
        if (!cancelled) {
          setState({ busy: false, url: result.url });
          if (result.errorMsg) {
            toast.error("Could not load the CV link.", {
              description: result.errorMsg,
            });
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  let action: ReactNode;
  if (state.busy) {
    action = (
      <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9dfeb] px-4 text-sm font-semibold text-[#8490a5] dark:border-white/10">
        Loading CV link…
      </span>
    );
  } else if (state.url) {
    action = (
      <a
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#171b25] px-4 text-sm font-semibold text-white transition hover:bg-brand-blue"
        download
        href={state.url}
      >
        <DownloadSimple size={16} weight="bold" />
        Download CV
      </a>
    );
  } else {
    action = (
      <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9dfeb] px-4 text-sm font-semibold text-[#8490a5] dark:border-white/10">
        <FileText size={16} weight="bold" />
        CV unavailable
      </span>
    );
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {action}
      <span className="text-xs text-[#9ba4b5]">
        {cvFilename}
        {cvContentType ? ` · ${cvContentType.replace("application/", "")}` : ""}
      </span>
    </div>
  );
}

/**
 * The applications inbox: an email-style two-pane reader, sharing its
 * behavior with the contact-inquiries and event-registrations inboxes via
 * resource-inbox.tsx. Admin contacts applicants themselves — this surface
 * only shows data and hands out the CV. The signed CV URL isn't part of the
 * list payload, so it's fetched lazily whenever the selection changes.
 */
export function ApplicationsInbox({
  records,
  setRecords,
}: Readonly<{
  records: CmsJobApplicationRecord[];
  setRecords: Dispatch<SetStateAction<CmsJobApplicationRecord[]>>;
}>) {
  const inbox = useResourceInbox({
    apiBase: "/api/admin/applications",
    deleteConfirmSuffix: "Their CVs are removed from storage too.",
    getState: (record) => ({ ...record.application, readAt: record.application.readAt ?? null }),
    itemLabel: "application",
    matchesQuery: (record, needle) =>
      `${record.application.fullName} ${record.application.email}`
        .toLocaleLowerCase()
        .includes(needle),
    onMutated: () => window.dispatchEvent(new CustomEvent("mgm:application-updated")),
    records,
    setRecords,
    withState: (record, patch) => ({
      ...record,
      application: { ...record.application, ...patch },
    }),
  });

  return (
    <ResourceInboxShell
      emptyDetailCopy={{
        description: "Applicant details, their motivation, and a CV download link appear here.",
        title: "Select an application",
      }}
      emptyMessages={EMPTY_MESSAGES}
      getRowAriaLabel={(record) => `Select ${record.application.fullName}`}
      inbox={inbox}
      renderDetail={(record) => (
        <>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] uppercase ${APPLICANT_BADGE[record.application.applicantType] ?? APPLICANT_BADGE.general}`}
          >
            {record.application.applicantType === "ub-student"
              ? "Universitas Brawijaya"
              : "General applicant"}
          </span>

          <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em]">
            {record.application.fullName}
          </h2>
          <p className="mt-1 text-sm text-[#778299] dark:text-white/45">
            {record.application.jobTitle}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[#eef1f7] bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
                Email
              </p>
              <a
                className="mt-1.5 block truncate text-sm font-semibold text-brand-blue hover:underline"
                href={`mailto:${record.application.email}`}
              >
                {record.application.email}
              </a>
            </div>
            <div className="rounded-xl border border-[#eef1f7] bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
                Phone
              </p>
              <a
                className="mt-1.5 block truncate text-sm font-semibold text-brand-blue hover:underline"
                href={`tel:${record.application.phoneCountry}${record.application.phoneNumber}`}
              >
                {record.application.phoneCountry} {record.application.phoneNumber}
              </a>
            </div>
            {record.application.applicantType === "ub-student" ? (
              <>
                <div className="rounded-xl border border-[#eef1f7] bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
                    NIM / NIDN / NIP
                  </p>
                  <p className="mt-1.5 truncate text-sm font-semibold">{record.application.nim}</p>
                </div>
                <div className="rounded-xl border border-[#eef1f7] bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
                    Faculty
                  </p>
                  <p className="mt-1.5 truncate text-sm font-semibold">
                    {record.application.faculty}
                  </p>
                </div>
              </>
            ) : null}
          </div>

          <div className="mt-6">
            <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#8490a5] uppercase">
              Why they want to join
            </p>
            <p className="mt-2 rounded-xl border border-[#eef1f7] bg-white p-4 text-sm leading-6 whitespace-pre-wrap text-[#3e4859] dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-white/80">
              {record.application.motivation}
            </p>
          </div>

          <CvDownload
            cvContentType={record.application.cvContentType}
            cvFilename={record.application.cvFilename}
            key={record.slug}
            slug={record.slug}
          />
        </>
      )}
      renderPrimaryAction={(record) => (
        <a
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline"
          href={`/careers/${record.application.jobSlug}`}
          rel="noreferrer"
          target="_blank"
        >
          <ArrowSquareOut size={15} weight="bold" />
          View role
        </a>
      )}
      renderRow={(record, { unread }) => (
        <span className="min-w-0 flex-1">
          <span
            className={`flex items-center gap-2 text-sm ${unread ? "font-bold" : "font-medium"}`}
          >
            {unread ? <span className="size-1.5 shrink-0 rounded-full bg-brand-blue" /> : null}
            <span className="truncate">{record.application.fullName}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-[#778299] dark:text-white/45">
            {record.application.email}
          </span>
          <span className="mt-0.5 block truncate text-xs text-[#9ba4b5]">
            {record.application.jobTitle} · {formatSubmittedDate(record.createdAt)}
          </span>
        </span>
      )}
      searchPlaceholder="Search name or email"
      submittedLabel="Applied"
    />
  );
}
