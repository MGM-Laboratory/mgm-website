import { useRef } from "react";

import { versionedJsonHeaders } from "./record-version";

/**
 * Remembers the `updatedAt` of the record that an editor shows. The editor
 * sends it with each save and takes the new value from the answer, so a
 * second save in the same session carries the version of the first.
 */
export function useRecordVersion(initialUpdatedAt?: string) {
  const version = useRef(initialUpdatedAt);
  return {
    headers: () => versionedJsonHeaders(version.current),
    remember: (updatedAt?: string) => {
      if (updatedAt) version.current = updatedAt;
    },
  };
}
