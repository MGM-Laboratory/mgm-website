"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CmsJobApplicationRecord } from "@/lib/career-cms";

/**
 * The admin inbox feed: every application, newest first. Same revalidation
 * contract as the other records hooks; the inbox list itself is never cached
 * server-side, so each load reflects the current read/archive states.
 */
export function useJobApplications(
  initialRecords: readonly CmsJobApplicationRecord[] = [],
  endpoint = "/api/admin/applications",
) {
  const [records, setRecords] = useState<CmsJobApplicationRecord[]>(() => [...initialRecords]);
  const [ready, setReady] = useState(initialRecords.length > 0);
  const requestVersion = useRef(0);
  const endpointRef = useRef(endpoint);
  useEffect(() => {
    endpointRef.current = endpoint;
  }, [endpoint]);

  const loadRecords = useCallback(async (signal?: AbortSignal) => {
    const version = ++requestVersion.current;
    try {
      const response = await fetch(endpointRef.current, { cache: "default", signal });
      const data = (response.ok ? await response.json() : { records: [] }) as {
        records?: CmsJobApplicationRecord[];
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
    const refresh = () => void loadRecords(controller.signal);
    const channel = new BroadcastChannel("mgm-job-applications");

    const initialLoad = window.setTimeout(() => void loadRecords(controller.signal), 0);
    window.addEventListener("mgm:application-updated", refresh);
    channel.addEventListener("message", refresh);
    return () => {
      controller.abort();
      window.clearTimeout(initialLoad);
      channel.close();
      window.removeEventListener("mgm:application-updated", refresh);
    };
  }, [loadRecords]);

  return { ready, records, setRecords };
}
