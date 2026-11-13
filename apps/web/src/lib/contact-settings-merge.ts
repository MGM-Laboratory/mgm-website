import type { ContactSettings } from "@repo/shared";

/** The settings that only the superadmin may change. */
export const ROUTING_FIELDS = [
  "mailStrategy",
  "mailProviderOrder",
  "mailProviderWeights",
  "mailProviderLimits",
] as const;

/** A stable string of a value, with object keys sorted and array order kept. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return item;
  });
}

type Merged = { ok: true; payload: Partial<ContactSettings> } | { ok: false };

/**
 * The payload a non-superadmin may save. The API fills any missing routing
 * field with its default, so a save that only dropped the fields would reset
 * the routing the superadmin chose. This keeps the stored routing instead,
 * and refuses a body that tries to change it.
 */
export function mergeOrdinarySave(
  body: Partial<ContactSettings>,
  current: ContactSettings,
): Merged {
  const changed = ROUTING_FIELDS.some(
    (field) => body[field] !== undefined && canonical(body[field]) !== canonical(current[field]),
  );
  if (changed) return { ok: false };
  const payload: Partial<ContactSettings> = Object.fromEntries(
    Object.entries(body).filter(([key]) => !(ROUTING_FIELDS as readonly string[]).includes(key)),
  );
  for (const field of ROUTING_FIELDS) {
    Object.assign(payload, { [field]: current[field] });
  }
  return { ok: true, payload };
}
