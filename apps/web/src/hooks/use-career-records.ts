"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CmsJobRecord } from "@/lib/career-cms";

/**
 * Starts from the server-rendered CMS snapshot, then revalidates in the
 * browser. Same contract as the article/member records hooks: a request made
 * before a publish can never overwrite the newer broadcast record when it
 * eventually completes.
 */
export function useCareerRecords(
  initialRecords: readonly CmsJobRecord[] = [],
  endpoint = "/api/admin/careers",
) {
  const [records, setRecords] = useState<CmsJobRecord[]>(() => [...initialRecords]);
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
        records?: CmsJobRecord[];
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
    const channel = new BroadcastChannel("mgm-career-cms");

    const initialLoad = window.setTimeout(() => void loadRecords(controller.signal), 0);
    window.addEventListener("mgm:career-updated", refresh);
    channel.addEventListener("message", refresh);
    return () => {
      controller.abort();
      window.clearTimeout(initialLoad);
      channel.close();
      window.removeEventListener("mgm:career-updated", refresh);
    };
  }, [loadRecords]);

  return { ready, records, setRecords };
}
