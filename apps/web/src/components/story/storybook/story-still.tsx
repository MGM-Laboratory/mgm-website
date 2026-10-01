import type { ReactNode } from "react";
import Image from "next/image";

import { STORY_STILLS } from "@/components/story/assets/files-stills";

/**
 * A still rendered from the WebGL story's own scenes (`STORY_STILLS`), in the
 * page's scheme: both files are in the HTML and CSS shows the one that
 * matches (`.story-still-light`, `.story-still-dark`), so a theme switch
 * needs no script. Lazy, and served as they are (already WebP, sized for
 * the storybook). Without a still for `id` yet, `fallback` stands in.
 */
export function StoryStill({
  id,
  alt,
  sizes,
  fallback,
}: Readonly<{ id: string; alt: string; sizes: string; fallback: ReactNode }>) {
  const still = STORY_STILLS.get(id);
  if (!still) return <>{fallback}</>;
  return (
    <>
      <Image
        src={still.light.url}
        alt={alt}
        width={still.width}
        height={still.height}
        sizes={sizes}
        loading="lazy"
        unoptimized
        className="story-still story-still-light"
      />
      <Image
        src={still.dark.url}
        alt={alt}
        width={still.width}
        height={still.height}
        sizes={sizes}
        loading="lazy"
        unoptimized
        className="story-still story-still-dark"
      />
    </>
  );
}
