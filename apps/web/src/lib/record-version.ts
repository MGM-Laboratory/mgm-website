/**
 * The header that carries the `updatedAt` of the record that an editor loaded.
 * The API answers 409 when the stored record is newer, so a save cannot
 * silently replace what someone else saved in the meantime.
 */
export const EXPECTED_VERSION_HEADER = "x-cms-expected-updated-at";

/** The JSON headers of a record save, with the loaded version when there is one. */
export function versionedJsonHeaders(updatedAt?: string): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(updatedAt ? { [EXPECTED_VERSION_HEADER]: updatedAt } : {}),
  };
}
