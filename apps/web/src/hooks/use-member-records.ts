"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MEMBERS, type Member } from "@/data/members";
import { mergeMemberRecords, type CmsMemberRecord } from "@/lib/member-cms";

function replaceRecord(records: readonly CmsMemberRecord[], next: CmsMemberRecord) {
  return [
    ...records.filter(
      (record) =>
        record.slug !== next.slug &&
        record.slug !== next.sourceSlug &&
        record.sourceSlug !== next.slug &&
        record.sourceSlug !== next.sourceSlug,
    ),
    next,
  ];
}

/**
 * Starts from the server-rendered CMS snapshot, then revalidates in the
 * browser. A request made before an admin publish can never overwrite the
 * newer broadcast record when it eventually completes.
 */
export function useMemberRecords(initialRecords: readonly CmsMemberRecord[] = []) {
  const [records, setRecords] = useState<CmsMemberRecord[]>(() => [...initialRecords]);
  const [ready, setReady] = useState(initialRecords.length > 0);
  const requestVersion = useRef(0);

  const loadRecords = useCallback(async (signal?: AbortSignal) => {
    const version = ++requestVersion.current;
    try {
      // The route revalidates its ETag on revisit, preserving immediate edits
      // without downloading and parsing an unchanged directory again.
      const response = await fetch("/api/member-cms", { cache: "default", signal });
      const data = (response.ok ? await response.json() : { records: [] }) as {
        records?: CmsMemberRecord[];
      };
      if (!signal?.aborted && version === requestVersion.current) {
        setRecords(data.records ?? []);
      }
    } catch {
      // Retain the server snapshot (or a just-published record) on transient
      // failures instead of falling back to an older static profile.
    } finally {
      if (!signal?.aborted) setReady(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const applyRecord = (record: CmsMemberRecord) => {
      requestVersion.current += 1;
      setRecords((current) => replaceRecord(current, record));
    };
    const refresh = (event?: Event | MessageEvent<{ record?: CmsMemberRecord }>) => {
      const record =
        event instanceof MessageEvent
          ? event.data?.record
          : (event as CustomEvent<CmsMemberRecord | undefined> | undefined)?.detail;
      if (record?.slug) applyRecord(record);
      void loadRecords();
    };
    const channel = new BroadcastChannel("mgm-member-cms");

    const initialLoad = window.setTimeout(() => void loadRecords(controller.signal), 0);
    window.addEventListener("mgm:member-updated", refresh);
    channel.addEventListener("message", refresh);
    return () => {
      controller.abort();
      window.clearTimeout(initialLoad);
      channel.close();
      window.removeEventListener("mgm:member-updated", refresh);
    };
  }, [loadRecords]);

  const members = useMemo(() => mergeMemberRecords(MEMBERS, records), [records]);
  return { members, ready, records, setRecords } as {
    members: Member[];
    ready: boolean;
    records: CmsMemberRecord[];
    setRecords: React.Dispatch<React.SetStateAction<CmsMemberRecord[]>>;
  };
}
