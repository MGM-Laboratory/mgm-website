"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { publishedArticles, type CmsArticleRecord } from "@/lib/article-cms";

function replaceRecord(records: readonly CmsArticleRecord[], next: CmsArticleRecord) {
  const without = records.filter((record) => record.slug !== next.slug);
  return [...without, next];
}

/**
 * Starts from the server-rendered CMS snapshot, then revalidates in the
 * browser. A request made before an admin publish can never overwrite the
 * newer broadcast record when it eventually completes.
 *
 * The admin workspace points at its own authenticated feed so unpublished
 * drafts appear in the sidebar; every public surface uses the default
 * published-only feed.
 */
export function useArticleRecords(
  initialRecords: readonly CmsArticleRecord[] = [],
  endpoint = "/api/articles-cms",
) {
  const [records, setRecords] = useState<CmsArticleRecord[]>(() => [...initialRecords]);
  const [ready, setReady] = useState(initialRecords.length > 0);
  const requestVersion = useRef(0);
  const endpointRef = useRef(endpoint);
  useEffect(() => {
    endpointRef.current = endpoint;
  }, [endpoint]);

  const loadRecords = useCallback(async (signal?: AbortSignal) => {
    const version = ++requestVersion.current;
    try {
      // The route revalidates its ETag on revisit, preserving immediate edits
      // without downloading and parsing an unchanged feed again.
      const response = await fetch(endpointRef.current, { cache: "default", signal });
      const data = (response.ok ? await response.json() : { records: [] }) as {
        records?: CmsArticleRecord[];
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
    const applyRecord = (record: CmsArticleRecord) => {
      requestVersion.current += 1;
      setRecords((current) => replaceRecord(current, record));
    };
    const refresh = (event?: Event | MessageEvent<{ record?: CmsArticleRecord }>) => {
      const record =
        event instanceof MessageEvent
          ? event.data?.record
          : (event as CustomEvent<CmsArticleRecord | undefined> | undefined)?.detail;
      if (record?.slug) applyRecord(record);
      void loadRecords();
    };
    const channel = new BroadcastChannel("mgm-article-cms");

    const initialLoad = window.setTimeout(() => void loadRecords(controller.signal), 0);
    window.addEventListener("mgm:article-updated", refresh);
    channel.addEventListener("message", refresh);
    return () => {
      controller.abort();
      window.clearTimeout(initialLoad);
      channel.close();
      window.removeEventListener("mgm:article-updated", refresh);
    };
  }, [loadRecords]);

  const articles = useMemo(() => publishedArticles(records), [records]);
  return { articles, ready, records, setRecords } as {
    articles: CmsArticleRecord[];
    ready: boolean;
    records: CmsArticleRecord[];
    setRecords: React.Dispatch<React.SetStateAction<CmsArticleRecord[]>>;
  };
}
