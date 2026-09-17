import { z } from "zod";

export const HOME_VIDEO_MODES = ["none", "upload", "url", "youtube"] as const;
export type HomeVideoMode = (typeof HOME_VIDEO_MODES)[number];

const YOUTUBE_URL_PATTERN =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w-]{6,}/i;

// The lab's homepage video block — a singleton, same slug/data Json shape as
// every other CMS collection purely for consistency (see CmsContactSettings).
export const homeContentSchema = z
  .object({
    videoMode: z.enum(HOME_VIDEO_MODES).default("none"),
    /** S3 media key (upload mode). */
    videoKey: z.string().min(1).max(500).optional(),
    videoName: z.string().trim().max(300).optional(),
    videoSize: z.number().int().nonnegative().max(1_073_741_824).optional(),
    /** A direct file URL (url mode) or a YouTube URL (youtube mode). */
    videoUrl: z.string().trim().max(500).optional(),
    videoTitle: z.string().trim().max(200).default(""),
    videoDescription: z.string().trim().max(1000).default(""),
  })
  .refine(
    ({ videoMode, videoUrl }) =>
      (videoMode !== "url" && videoMode !== "youtube") || Boolean(videoUrl?.trim()),
    { message: "Add a video URL for this mode.", path: ["videoUrl"] },
  )
  .refine(
    ({ videoMode, videoUrl }) =>
      videoMode !== "youtube" || !videoUrl || YOUTUBE_URL_PATTERN.test(videoUrl),
    { message: "Enter a valid YouTube URL.", path: ["videoUrl"] },
  );

export type HomeContent = z.infer<typeof homeContentSchema>;

// Used both as the API's fallback when no CMS record has been saved yet, and
// as the web's fallback if the API is unreachable.
export const DEFAULT_HOME_CONTENT: HomeContent = {
  videoMode: "none",
  videoTitle: "",
  videoDescription: "",
};
