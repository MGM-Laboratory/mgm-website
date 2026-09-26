/**
 * A complete table keyed by a string union, as a read-only Map: lookups go
 * through `get()` instead of indexing an object with a runtime key.
 */
export function tableMap<K extends string, V>(table: Record<K, V>): ReadonlyMap<K, V> {
  return new Map(Object.entries(table) as [K, V][]);
}
