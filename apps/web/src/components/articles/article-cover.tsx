import { ArrowUpRight, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ArticleCover({ src, className }: { src?: string; className?: string }) {
  return (
    <div
      className={cn(
        "article-cover relative isolate overflow-hidden bg-[var(--surface-muted)] aspect-[370/230]",
        className,
      )}
    >
      {src ? (
        // CMS covers retain their existing URL and load once, including on hover.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="article-cover-image block size-full object-cover" />
      ) : (
        <div className="article-cover-image grid size-full place-items-center">
          <ImageIcon className="size-10 text-foreground/25" strokeWidth={1.5} />
        </div>
      )}
      <span
        className="article-cover-tint pointer-events-none absolute inset-0"
        aria-hidden="true"
      />
      <span
        className="article-cover-arrow absolute right-3 bottom-3 grid size-9 place-items-center rounded-full bg-brand-blue text-white"
        aria-hidden="true"
      >
        <ArrowUpRight className="size-5" strokeWidth={2.25} />
      </span>
    </div>
  );
}
