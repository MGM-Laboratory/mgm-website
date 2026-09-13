"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CmsPublicationRecord } from "@/lib/publication-cms";

function replaceRecord(records: readonly CmsPublicationRecord[], next: CmsPublicationRecord) {
  const without = records.filter((record) => record.slug !== next.slug);
  return [...without, next];
}

/**
 * Starts from the server-rendered CMS snapshot, then revalidates in the
 * browser. A request made before an admin publish can never overwrite the
 * newer broadcast record when it eventually completes.
 *
 * The admin workspace points at its own authenticated feed so unpublished
 * drafts appear in the sidebar.
 */
export function usePublicationRecords(initialRecords: readonly CmsPublicationRecord[] = []) {
  const [records, setRecords] = useState<CmsPublicationRecord[]>(() => [...initialRecords]);
  const [ready, setReady] = useState(initialRecords.length > 0);
  const requestVersion = useRef(0);

  const loadRecords = useCallback(async (signal?: AbortSignal) => {
    const version = ++requestVersion.current;
    try {
      const response = await fetch("/api/admin/publications", { cache: "default", signal });
      const data = (response.ok ? await response.json() : { records: [] }) as {
        records?: CmsPublicationRecord[];
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
    const applyRecord = (record: CmsPublicationRecord) => {
      requestVersion.current += 1;
      setRecords((current) => replaceRecord(current, record));
    };
    const refresh = (event?: Event | MessageEvent<{ record?: CmsPublicationRecord }>) => {
      const record =
        event instanceof MessageEvent
          ? event.data?.record
          : (event as CustomEvent<CmsPublicationRecord | undefined> | undefined)?.detail;
      if (record?.slug) applyRecord(record);
      void loadRecords();
    };
    const channel = new BroadcastChannel("mgm-publication-cms");

    const initialLoad = window.setTimeout(() => void loadRecords(controller.signal), 0);
    window.addEventListener("mgm:publication-updated", refresh);
    channel.addEventListener("message", refresh);
    return () => {
      controller.abort();
      window.clearTimeout(initialLoad);
      channel.close();
      window.removeEventListener("mgm:publication-updated", refresh);
    };
  }, [loadRecords]);

  return { ready, records, setRecords } as {
    ready: boolean;
    records: CmsPublicationRecord[];
    setRecords: React.Dispatch<React.SetStateAction<CmsPublicationRecord[]>>;
  };
}
