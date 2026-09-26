import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/** False during the server render and hydration, true afterwards. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
