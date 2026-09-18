import {
  DiscordLogoIcon,
  GithubLogoIcon,
  InstagramLogoIcon,
  LinkedinLogoIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react";
import type { Ref } from "react";

export type GlyphProps = { className?: string; ref?: Ref<SVGSVGElement> };

function glyph(Icon: typeof GithubLogoIcon) {
  return function Glyph({ className, ref }: GlyphProps) {
    return <Icon ref={ref} aria-hidden className={className} weight="fill" />;
  };
}

export const InstagramGlyph = glyph(InstagramLogoIcon);
export const LinkedinGlyph = glyph(LinkedinLogoIcon);
export const GithubGlyph = glyph(GithubLogoIcon);
export const WhatsappGlyph = glyph(WhatsappLogoIcon);
export const DiscordGlyph = glyph(DiscordLogoIcon);
