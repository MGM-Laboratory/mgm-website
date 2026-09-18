/**
 * Dropped into every route's loading.tsx fallback. RouteTransition can't
 * tell a genuinely-finished navigation (usePathname() changed because real
 * content committed) apart from one that only committed a Suspense fallback
 * (usePathname() changes at the same moment loading.tsx renders) without
 * this marker — it watches for this node's removal to know the real page
 * has swapped in before revealing the curtain.
 */
export function RouteLoadingSentinel() {
  return <span data-route-loading="" aria-hidden className="hidden" />;
}
