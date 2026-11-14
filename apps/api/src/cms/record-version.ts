import { BadRequestException, ConflictException } from "@nestjs/common";

export const EXPECTED_VERSION_HEADER = "x-cms-expected-updated-at";

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

const CONFLICT_MESSAGE =
  "Someone else saved this record after you opened it. Reload the page and apply your change again.";

/**
 * The `updatedAt` of the record that the editor loaded, from the request
 * header. A save without the header keeps the old behavior and does not check
 * the version.
 */
export function parseExpectedVersion(value: string | undefined): Date | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  const date = ISO_INSTANT.test(text) ? new Date(text) : new Date(Number.NaN);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${EXPECTED_VERSION_HEADER}: send the updatedAt of the record.`);
  }
  return date;
}

/** Refuses the save when the stored record is not the one that the editor loaded. */
export function assertVersion(current: { updatedAt: Date }, expected: Date | undefined) {
  if (expected && current.updatedAt.getTime() !== expected.getTime()) {
    throw new ConflictException(CONFLICT_MESSAGE);
  }
}

/**
 * A save that names a version needs the record to exist. When it is gone or
 * renamed, the editor must not create it again.
 */
export function assertRecordPresent(expected: Date | undefined) {
  if (expected) throw new ConflictException(CONFLICT_MESSAGE);
}

function isRecordNotFound(error: unknown) {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2025"
  );
}

/**
 * Runs an update whose `where` holds the `updatedAt` that the transaction
 * read. When another save changed the row in between, no row matches and
 * Prisma answers P2025, which is a conflict and not a missing record.
 */
export async function orConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isRecordNotFound(error)) throw new ConflictException(CONFLICT_MESSAGE);
    throw error;
  }
}
