"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CmsAdminRecord } from "@/lib/admin-permissions";

function replaceRecord(records: readonly CmsAdminRecord[], next: CmsAdminRecord) {
  const without = records.filter((record) => record.slug !== next.slug);
  return [...without, next];
}

/**
 * The managed admin accounts behind the Admin Management workspace. Follows
 * the same server-snapshot + BroadcastChannel refresh pattern as the other
 * collection hooks, but the endpoint is superadmin-only.
 */
export function useAdminRecords(initialRecords: readonly CmsAdminRecord[] = []) {
  const [records, setRecords] = useState<CmsAdminRecord[]>(() => [...initialRecords]);
  const [ready, setReady] = useState(initialRecords.length > 0);
  const requestVersion = useRef(0);

  const loadRecords = useCallback(async (signal?: AbortSignal) => {
    const version = ++requestVersion.current;
    try {
      const response = await fetch("/api/admin/admins", { cache: "default", signal });
      const data = (response.ok ? await response.json() : { records: [] }) as {
        records?: CmsAdminRecord[];
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
    const applyRecord = (record: CmsAdminRecord) => {
      requestVersion.current += 1;
      setRecords((current) => replaceRecord(current, record));
    };
    const refresh = (event?: Event | MessageEvent<{ record?: CmsAdminRecord }>) => {
      const record =
        event instanceof MessageEvent
          ? event.data?.record
          : (event as CustomEvent<CmsAdminRecord | undefined> | undefined)?.detail;
      if (record?.slug) applyRecord(record);
      void loadRecords();
    };
    const channel = new BroadcastChannel("mgm-admin-cms");

    const initialLoad = window.setTimeout(() => void loadRecords(controller.signal), 0);
    window.addEventListener("mgm:admin-updated", refresh);
    channel.addEventListener("message", refresh);
    return () => {
      controller.abort();
      window.clearTimeout(initialLoad);
      channel.close();
      window.removeEventListener("mgm:admin-updated", refresh);
    };
  }, [loadRecords]);

  return { ready, records, setRecords } as {
    ready: boolean;
    records: CmsAdminRecord[];
    setRecords: React.Dispatch<React.SetStateAction<CmsAdminRecord[]>>;
  };
}
