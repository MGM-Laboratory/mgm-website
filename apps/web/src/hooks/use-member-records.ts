"use client";

import { useEffect, useMemo, useState } from "react";

import { MEMBERS, type Member } from "@/data/members";
import { mergeMemberRecords, type CmsMemberRecord } from "@/lib/member-cms";

export function useMemberRecords() {
  const [records, setRecords] = useState<CmsMemberRecord[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/member-cms", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { records: [] }))
      .then((data: { records?: CmsMemberRecord[] }) => setRecords(data.records ?? []))
      .catch(() => setRecords([]))
      .finally(() => setReady(true));
    return () => controller.abort();
  }, []);

  const members = useMemo(() => mergeMemberRecords(MEMBERS, records), [records]);
  return { members, ready, records, setRecords } as {
    members: Member[];
    ready: boolean;
    records: CmsMemberRecord[];
    setRecords: React.Dispatch<React.SetStateAction<CmsMemberRecord[]>>;
  };
}
