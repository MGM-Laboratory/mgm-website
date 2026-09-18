"use client";

import type { CmsEventRecord } from "@/lib/events-cms";
import { useCmsRecords } from "@/hooks/use-cms-records";

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
  return useCmsRecords<CmsEventRecord>({
    channelName: "mgm-event-cms",
    endpoint,
    initialRecords,
    updateEventName: "mgm:event-updated",
  });
}
