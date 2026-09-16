declare global {
  interface Window {
    google?: { maps: typeof google.maps };
  }
}

let scriptPromise: Promise<void> | undefined;

/** Loads the Maps JS API exactly once, however many maps end up on a page. */
export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load Google Maps."));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}
