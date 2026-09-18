import type { ComponentType } from "react";
import {
  SiJira,
  SiFigma,
  SiNotion,
  SiClaude,
  SiKimi,
  SiElevenlabs,
  SiSentry,
  SiDatadog,
  SiGrafana,
  SiCoderabbit,
  SiN8n,
  SiMeilisearch,
  SiWhatsapp,
  SiGooglecloud,
  SiVercel,
  SiGoogletagmanager,
  SiMeta,
  SiFramer,
  SiMaze,
  SiRailway,
  SiDocker,
  SiGithub,
  type IconType,
} from "@icons-pack/react-simple-icons";
import { Bot, Cloud, Mail, Server } from "lucide-react";

export type ToolIcon = IconType | ComponentType<{ size?: number | string; className?: string }>;

/**
 * Real brand marks where simple-icons has one; a plain Lucide glyph where it
 * doesn't (ChatGPT/OpenAI, GLM, Devin, AWS, Azure, Local Inference, SMTP
 * have no simple-icons entry) — never an invented logo.
 */
export const TOOL_ICONS: Record<string, ToolIcon> = {
  Jira: SiJira,
  Figma: SiFigma,
  Notion: SiNotion,
  "AI Agents": Bot,
  Maze: SiMaze,
  Framer: SiFramer,
  Claude: SiClaude,
  ChatGPT: Bot,
  Kimi: SiKimi,
  GLM: Bot,
  "Local Inference": Server,
  ElevenLabs: SiElevenlabs,
  Sentry: SiSentry,
  Datadog: SiDatadog,
  Grafana: SiGrafana,
  CodeRabbit: SiCoderabbit,
  Devin: Bot,
  n8n: SiN8n,
  Meilisearch: SiMeilisearch,
  WABA: SiWhatsapp,
  "SMTP Routing": Mail,
  AWS: Cloud,
  GCP: SiGooglecloud,
  Azure: Cloud,
  "Google APIs": SiGooglecloud,
  GTM: SiGoogletagmanager,
  "Meta Ads": SiMeta,
  "Data Center": Server,
  Vercel: SiVercel,
  Railway: SiRailway,
  Docker: SiDocker,
  GitHub: SiGithub,
};
