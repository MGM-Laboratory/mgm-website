// OpenStreetMap's embed needs no API key/billing — Google Maps' equivalent
// does, and this site has no Maps API key configured anywhere. Its zoom
// controls and attribution strip are baked into the iframe and can't be
// restyled, so this stays a single plain frame rather than another bordered
// box wrapping a box — one visual "window", not a widget.
export function HqMap({ lat, lng }: Readonly<{ lat: number; lng: number }>) {
  const delta = 0.004;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join("%2C");
  const embedSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;

  return (
    <iframe
      title="MGM Laboratory location"
      src={embedSrc}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      className="h-40 w-full rounded-xl border border-[var(--line)] dark:brightness-[0.85] dark:contrast-[1.15] dark:saturate-[0.8]"
    />
  );
}
