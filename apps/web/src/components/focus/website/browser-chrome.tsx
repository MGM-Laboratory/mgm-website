// Shared "browser window" chrome strip — three dots, reused across the
// Focus/Website sections so every card reads as its own little browser tab
// without redrawing the same three circles in five different files.
export function BrowserChrome({ accent }: { accent: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-t-lg border border-b-0 border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2">
      <span className="size-2 rounded-full bg-brand-red" />
      <span className="size-2 rounded-full bg-brand-yellow" />
      <span className="size-2 rounded-full bg-brand-green" />
      <span
        className="ml-2 h-1.5 flex-1 max-w-20 rounded-full"
        style={{ backgroundColor: accent, opacity: 0.35 }}
      />
    </div>
  );
}
