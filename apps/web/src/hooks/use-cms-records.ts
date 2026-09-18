"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RecordsOptions<T> = {
  channelName: string;
  endpoint: string;
  initialRecords: readonly T[];
  updateEventName: string;
};

/**
 * Revalidates a server-rendered CMS collection and refreshes it when either
 * the local custom event or its cross-tab BroadcastChannel counterpart fires.
 */
export function useCmsRecords<T>({
  channelName,
  endpoint,
  initialRecords,
  updateEventName,
}: RecordsOptions<T>) {
  const [records, setRecords] = useState<T[]>(() => [...initialRecords]);
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
      const data = (response.ok ? await response.json() : { records: [] }) as { records?: T[] };
      if (!signal?.aborted && version === requestVersion.current) setRecords(data.records ?? []);
    } catch {
      // Retain the server snapshot on transient failures.
    } finally {
      if (!signal?.aborted) setReady(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => void loadRecords(controller.signal);
    const channel = new BroadcastChannel(channelName);

    const initialLoad = window.setTimeout(() => void loadRecords(controller.signal), 0);
    window.addEventListener(updateEventName, refresh);
    channel.addEventListener("message", refresh);
    return () => {
      controller.abort();
      window.clearTimeout(initialLoad);
      channel.close();
      window.removeEventListener(updateEventName, refresh);
    };
  }, [channelName, loadRecords, updateEventName]);

  return { ready, records, setRecords };
}
