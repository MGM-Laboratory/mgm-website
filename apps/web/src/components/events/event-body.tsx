import { ContentBody, type ContentBodyStyles } from "@/components/articles/article-body";
import type { ArticleBlock } from "@/lib/article-cms";

const EVENT_BODY_STYLES: ContentBodyStyles = {
  bodyText: "text-[1.0625rem] leading-[26px] text-[#3f3f3f] dark:text-[#d6d6d1]",
  figure: "mb-6",
  heading: {
    1: "mt-12 mb-5 font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] text-[#0e1116] dark:text-white",
    2: "mt-9 mb-4 font-display text-[1.375rem] leading-snug font-semibold tracking-[-0.015em] text-[#0e1116] dark:text-white",
    3: "mt-7 mb-3 font-display text-[1.15rem] leading-snug font-semibold tracking-[-0.01em] text-[#0e1116] dark:text-white",
  },
  imageClassName: "block w-full rounded-2xl",
  spacing: "mb-6",
};

export function EventBody({ blocks }: { blocks: ArticleBlock[] }) {
  return <ContentBody blocks={blocks} styles={EVENT_BODY_STYLES} />;
}
