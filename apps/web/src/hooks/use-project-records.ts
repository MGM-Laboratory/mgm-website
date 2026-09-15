"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CmsProjectRecord } from "@/lib/project-cms";

function replaceRecord(records: readonly CmsProjectRecord[], next: CmsProjectRecord) {
  const without = records.filter((record) => record.slug !== next.slug);
  return [...without, next];
}

/**
 * Starts from the server-rendered CMS snapshot, then revalidates in the
 * browser. A request made before an admin publish can never overwrite the
 * newer broadcast record when it eventually completes.
 *
 * The admin workspace points at its own authenticated feed so unpublished
 * drafts appear in the sidebar; every public surface uses the published-only
 * feed passed down from the server page.
 */
export function useProjectRecords(initialRecords: readonly CmsProjectRecord[] = []) {
  const [records, setRecords] = useState<CmsProjectRecord[]>(() => [...initialRecords]);
  const [ready, setReady] = useState(initialRecords.length > 0);
  const requestVersion = useRef(0);

  const loadRecords = useCallback(async (signal?: AbortSignal) => {
    const version = ++requestVersion.current;
    try {
      const response = await fetch("/api/admin/projects", { cache: "default", signal });
      const data = (response.ok ? await response.json() : { records: [] }) as {
        records?: CmsProjectRecord[];
      };
      if (!signal?.aborted && version === requestVersion.current) {
        setRecords(data.records ?? []);
      }
    } catch {
      // Retain the server snapshot on transient failures.
    } finally {
      if (!signal?.aborted) setReady(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const applyRecord = (record: CmsProjectRecord) => {
      requestVersion.current += 1;
      setRecords((current) => replaceRecord(current, record));
    };
    const refresh = (event?: Event | MessageEvent<{ record?: CmsProjectRecord }>) => {
      const record =
        event instanceof MessageEvent
          ? event.data?.record
          : (event as CustomEvent<CmsProjectRecord | undefined> | undefined)?.detail;
      if (record?.slug) applyRecord(record);
      void loadRecords();
    };
    const channel = new BroadcastChannel("mgm-project-cms");

    const initialLoad = window.setTimeout(() => void loadRecords(controller.signal), 0);
    window.addEventListener("mgm:project-updated", refresh);
    channel.addEventListener("message", refresh);
    return () => {
      controller.abort();
      window.clearTimeout(initialLoad);
      channel.close();
      window.removeEventListener("mgm:project-updated", refresh);
    };
  }, [loadRecords]);

  return { ready, records, setRecords } as {
    ready: boolean;
    records: CmsProjectRecord[];
    setRecords: React.Dispatch<React.SetStateAction<CmsProjectRecord[]>>;
  };
}
