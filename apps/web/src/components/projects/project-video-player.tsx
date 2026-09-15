import { parseVimeoId, parseYoutubeId, projectVideoUrl, safeProjectHref } from "@/lib/project-cms";
import type { ProjectDraft } from "@/lib/project-cms";

/**
 * Renders the project's demo video in whichever of the three modes the
 * editor chose. YouTube and Vimeo URLs are parsed down to a bare numeric/ID
 * value and the embed URL is built here — user-authored text never reaches
 * an iframe `src` directly.
 */
export function ProjectVideoPlayer({ project }: { project: ProjectDraft }) {
  if (project.videoMode === "upload" && project.videoKey) {
    return (
      <video
        className="block aspect-video w-full rounded-2xl bg-black"
        controls
        preload="metadata"
        src={projectVideoUrl(project.videoKey)}
      />
    );
  }

  if (project.videoMode === "youtube" && project.videoUrl) {
    const id = parseYoutubeId(project.videoUrl);
    if (!id) return null;
    return (
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
        <iframe
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 size-full"
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title={`${project.title} demo video`}
        />
      </div>
    );
  }

  if (project.videoMode === "url" && project.videoUrl) {
    const vimeoId = parseVimeoId(project.videoUrl);
    if (vimeoId) {
      return (
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
          <iframe
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 size-full"
            src={`https://player.vimeo.com/video/${vimeoId}`}
            title={`${project.title} demo video`}
          />
        </div>
      );
    }
    const href = safeProjectHref(project.videoUrl);
    if (!href) return null;
    return (
      <video
        className="block aspect-video w-full rounded-2xl bg-black"
        controls
        preload="metadata"
        src={href}
      />
    );
  }

  return null;
}
