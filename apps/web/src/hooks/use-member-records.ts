"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { MEMBERS, type Member } from "@/data/members";
import { mergeMemberRecords, type CmsMemberRecord } from "@/lib/member-cms";

export function useMemberRecords() {
  const [records, setRecords] = useState<CmsMemberRecord[]>([]);
  const [ready, setReady] = useState(false);

  const loadRecords = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/member-cms", { cache: "no-store", signal });
      const data = (response.ok ? await response.json() : { records: [] }) as {
        records?: CmsMemberRecord[];
      };
      setRecords(data.records ?? []);
    } catch {
      if (!signal?.aborted) setRecords([]);
    } finally {
      if (!signal?.aborted) setReady(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => void loadRecords();
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
