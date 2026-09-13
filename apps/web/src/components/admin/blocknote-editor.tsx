"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import type { PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useEffect, useRef } from "react";

import type { ArticleBlock } from "@/lib/article-cms";

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("This image could not be read."));
    reader.readAsDataURL(file);
  });
}

/**
 * The Notion-style writing surface used by the article editorial workflow.
 * Loaded with `next/dynamic({ ssr: false })` from the studio so the editor
 * bundle never reaches the public site. Images dropped into the document are
 * uploaded through the CMS media endpoint and stored as public media URLs.
 */
export default function BlocknoteEditor({
  initialContent,
  onChange,
  uploadPath,
}: {
  initialContent?: ArticleBlock[];
  onChange?: (blocks: ArticleBlock[]) => void;
  uploadPath: string;
}) {
  const uploadPathRef = useRef(uploadPath);
  useEffect(() => {
    uploadPathRef.current = uploadPath;
  }, [uploadPath]);

  const editor = useCreateBlockNote(
    {
      // BlockNote rejects an empty array here — an absent initial content
      // gives the same result (a single empty paragraph) without throwing.
      initialContent: (initialContent?.length ? initialContent : undefined) as
        PartialBlock[] | undefined,
      uploadFile: async (file: File) => {
        const image = await readAsDataUrl(file);
        const response = await fetch(uploadPathRef.current, {
          body: JSON.stringify({ image }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        if (!response.ok) throw new Error("This image could not be uploaded.");
        const { key } = (await response.json()) as { key: string };
        return `/api/articles-cms/media/${encodeURIComponent(key)}`;
      },
    },
    [],
  );

  return (
    <BlockNoteView
      editor={editor}
      onChange={(changed) => onChange?.(changed.document as unknown as ArticleBlock[])}
      theme="light"
    />
  );
}
