"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CmsEventRecord } from "@/lib/events-cms";

/**
 * Starts from the server-rendered CMS snapshot, then revalidates in the
 * browser. Same contract as the article/career records hooks: a request made
 * before a publish can never overwrite the newer broadcast record when it
 * eventually completes.
 */
export function useEventRecords(
  initialRecords: readonly CmsEventRecord[] = [],
  endpoint = "/api/admin/events",
) {
  const [records, setRecords] = useState<CmsEventRecord[]>(() => [...initialRecords]);
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
        records?: CmsEventRecord[];
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
    const channel = new BroadcastChannel("mgm-event-cms");

    const initialLoad = window.setTimeout(() => void loadRecords(controller.signal), 0);
    window.addEventListener("mgm:event-updated", refresh);
    channel.addEventListener("message", refresh);
    return () => {
      controller.abort();
      window.clearTimeout(initialLoad);
      channel.close();
      window.removeEventListener("mgm:event-updated", refresh);
    };
  }, [loadRecords]);

  return { ready, records, setRecords };
}
