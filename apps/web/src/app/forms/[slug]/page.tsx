import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { richTextToPlain, type PublicFormPayload } from "@repo/shared";

import { FormExperience } from "@/components/forms/form-experience";
import { formMediaSrc } from "@/lib/forms/public-media";
import { readPublicForm } from "@/lib/forms/public-read";
import { formPalette } from "@/lib/forms/public-theme";

// A form resolves at request time: publishing, closing and unlocking must
// reach the page at once.
export const dynamic = "force-dynamic";

type FormPageProps = PageProps<"/forms/[slug]">;

function designOf(payload: PublicFormPayload) {
  return payload.state === "open" ? payload.document.design : payload.design;
}

function originUrl(protocol: string, host: string | undefined) {
  try {
    return host && (protocol === "http" || protocol === "https")
      ? new URL(`${protocol}://${host}`)
      : undefined;
  } catch {
    return undefined;
  }
}

async function metadataBase() {
  // Open Graph needs an absolute image URL: resolve it against the host
  // this request reached (see projects/[slug]/page.tsx).
  const requestHeaders = await headers();
  const first = (name: string) => requestHeaders.get(name)?.split(",")[0]?.trim() || undefined;
  const host = first("x-forwarded-host") ?? first("host");
  const protocol =
    first("x-forwarded-proto") ??
    (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  return originUrl(protocol, host);
}

export async function generateMetadata({ params }: FormPageProps): Promise<Metadata> {
  const { slug } = await params;
  const payload = await readPublicForm(slug);
  if (!payload) return { title: "Form not found | MGM Laboratory", robots: { index: false } };
  if (payload.state !== "open") {
    return { title: `${payload.title} | MGM Laboratory`, robots: { index: false, follow: false } };
  }
  const { document } = payload;
  const seo = document.settings.seo;
  const title = `${seo.title || document.title} | MGM Laboratory`;
  const description =
    seo.description ||
    richTextToPlain(document.description).slice(0, 300) ||
    richTextToPlain(document.welcome.body).slice(0, 300) ||
    undefined;
  const image = seo.image ?? document.design.cover.media;
  const imageSrc = image && image.kind === "image" ? formMediaSrc(image) : undefined;
  const base = await metadataBase();
  return {
    title,
    description,
    metadataBase: base,
    robots: seo.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "MGM Laboratory",
      images: imageSrc && base ? [{ url: imageSrc, alt: image?.alt || document.title }] : undefined,
    },
    twitter: { card: imageSrc ? "summary_large_image" : "summary", title, description },
  };
}

export async function generateViewport({ params }: FormPageProps): Promise<Viewport> {
  const { slug } = await params;
  const payload = await readPublicForm(slug);
  if (!payload) return {};
  // The browser chrome wears the form's background. Under `auto` it can
  // only follow the system scheme (the site toggle can't reach a meta tag).
  const design = designOf(payload);
  if (design.colorMode !== "auto") {
    return { themeColor: formPalette(design.theme, design.colorMode).bg };
  }
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: formPalette(design.theme, "light").bg },
      { media: "(prefers-color-scheme: dark)", color: formPalette(design.theme, "dark").bg },
    ],
  };
}

export default async function FormPage({ params }: FormPageProps) {
  const { slug } = await params;
  const payload = await readPublicForm(slug);
  if (!payload) notFound();
  return <FormExperience payload={payload} key={payload.slug} />;
}
