import { z } from "zod";

export const HOME_VIDEO_MODES = ["none", "upload"] as const;
export type HomeVideoMode = (typeof HOME_VIDEO_MODES)[number];

// The homepage company-profile video is an uploaded file only, so the site can
// cache it and start it quickly. Records saved before that rule still carry a
// "url" or "youtube" mode; those read as "none" instead of failing validation.
const videoModeSchema = z.preprocess(
  (value) => (value === "upload" ? "upload" : "none"),
  z.enum(HOME_VIDEO_MODES),
);

// The lab's homepage video block, a singleton with the same slug/data Json
// shape as every other CMS collection purely for consistency (see
// CmsContactSettings). The section's title and description are written into
// the page itself, so the record holds the video and nothing else. Fields from
// older records (videoUrl, videoTitle, videoDescription) are stripped on parse.
export const homeContentSchema = z.object({
  videoMode: videoModeSchema.default("none"),
  /** S3 media key (upload mode). */
  videoKey: z.string().min(1).max(500).optional(),
  videoName: z.string().trim().max(300).optional(),
  videoSize: z.number().int().nonnegative().max(1_073_741_824).optional(),
});

export type HomeContent = z.infer<typeof homeContentSchema>;

// Used both as the API's fallback when no CMS record has been saved yet, and
// as the web's fallback if the API is unreachable.
export const DEFAULT_HOME_CONTENT: HomeContent = {
  videoMode: "none",
};
