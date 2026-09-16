declare global {
  interface Window {
    google?: { maps: typeof google.maps };
    gm_authFailure?: () => void;
  }
}

let scriptPromise: Promise<void> | undefined;

/**
 * Loads the Maps JS API exactly once. `gm_authFailure` is Google's own hook
 * for a missing/invalid/quota-exceeded key — the script itself still loads
 * successfully in that case, so `onerror` alone would miss it.
 */
export const loadGoogleMaps = (() => {
  let scriptPromise: Promise<void>;
  return (apiKey: string): Promise<void> => {
    if (window.google?.maps) return Promise.resolve();
    scriptPromise ??= new Promise((resolve, reject) => {
      window.gm_authFailure = () => reject(new Error("Google Maps authentication failed."));
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load Google Maps."));
      document.head.appendChild(script);
    });
    return scriptPromise;
  };
})();
