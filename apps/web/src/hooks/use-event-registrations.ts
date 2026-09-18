"use client";

import type { CmsEventRegistrationRecord } from "@/lib/events-cms";
import { useCmsRecords } from "@/hooks/use-cms-records";

/**
 * The admin inbox feed: every registration, newest first. Same revalidation
 * contract as the other records hooks; the inbox list itself is never cached
 * server-side, so each load reflects the current read/archive states.
 */
export function useEventRegistrations(
  initialRecords: readonly CmsEventRegistrationRecord[] = [],
  endpoint = "/api/admin/events/registrations",
) {
  return useCmsRecords<CmsEventRegistrationRecord>({
    channelName: "mgm-event-registrations",
    endpoint,
    initialRecords,
    updateEventName: "mgm:event-registration-updated",
  });
}
