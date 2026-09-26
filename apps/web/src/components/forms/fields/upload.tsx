"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleAlert,
  CloudUpload,
  File as FileIcon,
  ImageIcon,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react";
import {
  FORM_FILE_CATEGORY_TYPES,
  fieldMaxFileBytes,
  fieldMaxFiles,
  fileAccepted,
  isFileAnswer,
  type FormField,
  type FormFileAnswer,
} from "@repo/shared";

import { FormUploadError, uploadFormFile } from "@/lib/forms/public-client";
import { formatBytes } from "@/lib/forms/public-copy";

import { useFormController, type FieldProps } from "../form-context";
import { tableMap } from "../lookup";

/**
 * File and image uploads: a drop zone (or the file picker), checks against
 * the field's types, size and count before anything is sent, one progress
 * bar per file (XMLHttpRequest upload progress, the raw file as the body),
 * previews for pictures, remove and retry. The answer only lists files that
 * finished uploading. The admin preview simulates the upload.
 */

type Item = {
  id: string;
  name: string;
  size: number;
  type: string;
  status: "uploading" | "done" | "error" | "rejected";
  progress: number;
  message?: string;
  answer?: FormFileAnswer;
  preview?: string;
  file?: File;
  abort?: AbortController;
};

let counter = 0;
const nextId = () => `f${(counter += 1)}`;

/** Picture fields take only what the API accepts by its bytes (not HEIC or AVIF). */
const PICTURE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const PICTURE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];

function isPictureField(field: FormField) {
  return field.type === "image_upload" || field.type === "signature";
}

function accepts(field: FormField, file: { name: string; type: string }) {
  if (!fileAccepted(field, file)) return false;
  if (!isPictureField(field)) return true;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return PICTURE_MIMES.includes(file.type) || PICTURE_EXTENSIONS.includes(extension);
}

const FILE_CATEGORY_TYPES = tableMap(FORM_FILE_CATEGORY_TYPES);

function acceptAttribute(field: FormField) {
  if (isPictureField(field)) {
    return [...PICTURE_MIMES, ...PICTURE_EXTENSIONS.map((extension) => `.${extension}`)].join(",");
  }
  const categories =
    field.type === "image_upload" || field.type === "signature"
      ? (["image"] as const)
      : field.accept?.length
        ? field.accept
        : null;
  if (!categories) return undefined;
  return categories
    .flatMap((category) => {
      const types = FILE_CATEGORY_TYPES.get(category);
      return types ? [...types.mimes, ...types.extensions.map((extension) => `.${extension}`)] : [];
    })
    .join(",");
}

function imageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

/** One upload with progress; the preview only pretends. Shared with the signature pad. */
export function useUploader(field: FormField) {
  const { slug, upload, mode } = useFormController();
  return async (
    file: Blob,
    name: string,
    onProgress: (fraction: number) => void,
    signal?: AbortSignal,
  ) => {
    const size = await imageSize(file);
    if (mode === "preview") {
      for (let step = 1; step <= 10; step += 1) {
        if (signal?.aborted) throw new FormUploadError("Aborted", 0);
        await new Promise((resolve) => window.setTimeout(resolve, 60));
        onProgress(step / 10);
      }
      return {
        key: `preview-${field.id}-${Date.now()}`,
        name,
        size: file.size,
        type: file.type || "application/octet-stream",
        ...(size ?? {}),
      } satisfies FormFileAnswer;
    }
    const stored = await uploadFormFile({
      slug,
      fieldId: field.id,
      sessionId: upload.sessionId,
      token: upload.token,
      file,
      name,
      onProgress,
      signal,
    });
    return { ...stored, ...(size ?? {}) } satisfies FormFileAnswer;
  };
}

export function UploadField({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
}: FieldProps<FormFileAnswer[]>) {
  const { copy, labels, sound } = useFormController();
  const uploadOne = useUploader(field);
  const max = fieldMaxFiles(field);
  const limit = fieldMaxFileBytes(field);
  const image = field.type === "image_upload";
  const [items, setItems] = useState<Item[]>(() =>
    isFileAnswer(value)
      ? value.map((answer) => ({
          id: nextId(),
          name: answer.name,
          size: answer.size,
          type: answer.type,
          status: "done" as const,
          progress: 1,
          answer,
        }))
      : [],
  );
  const itemsRef = useRef(items);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [announce, setAnnounce] = useState("");

  const commit = (next: Item[]) => {
    itemsRef.current = next;
    setItems(next);
    const done = next.flatMap((item) =>
      item.status === "done" && item.answer ? [item.answer] : [],
    );
    onChange(done.length ? done : undefined);
  };
  const patch = (id: string, change: Partial<Item>) => {
    commit(itemsRef.current.map((item) => (item.id === id ? { ...item, ...change } : item)));
  };

  useEffect(
    () => () => {
      for (const item of itemsRef.current) {
        item.abort?.abort();
        if (item.preview) URL.revokeObjectURL(item.preview);
      }
    },
    [],
  );

  const start = (item: Item) => {
    if (!item.file) return;
    const abort = new AbortController();
    patch(item.id, { status: "uploading", progress: 0, message: undefined, abort });
    uploadOne(
      item.file,
      item.name,
      (progress) => {
        patch(item.id, { progress });
      },
      abort.signal,
    )
      .then((answer) => {
        patch(item.id, { status: "done", progress: 1, answer, abort: undefined });
        setAnnounce(`${item.name}: ${formatBytes(item.size)}`);
        sound("tick");
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        const message =
          error instanceof FormUploadError && error.status === 413
            ? copy.fileTooBig(formatBytes(limit))
            : error instanceof FormUploadError && error.status === 415
              ? copy.fileType
              : copy.uploadFailed;
        patch(item.id, { status: "error", message, abort: undefined });
        setAnnounce(`${item.name}: ${message}`);
      });
  };

  const add = (files: File[]) => {
    const live = itemsRef.current.filter((item) => item.status !== "rejected");
    const room = max - live.length;
    const added: Item[] = files.map((file, index) => {
      const base: Item = {
        id: nextId(),
        name: file.name,
        size: file.size,
        type: file.type,
        status: "uploading",
        progress: 0,
        file,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      };
      if (index >= room) return { ...base, status: "rejected", message: copy.tooManyFiles(max) };
      if (!accepts(field, file)) return { ...base, status: "rejected", message: copy.fileType };
      if (file.size > limit) {
        return { ...base, status: "rejected", message: copy.fileTooBig(formatBytes(limit)) };
      }
      return base;
    });
    // Rejections from an earlier drop make room for the new list.
    commit([...live, ...added]);
    for (const item of added) if (item.status === "uploading") start(item);
  };

  const remove = (item: Item) => {
    item.abort?.abort();
    if (item.preview) URL.revokeObjectURL(item.preview);
    commit(itemsRef.current.filter((candidate) => candidate.id !== item.id));
    inputRef.current?.focus();
  };

  const full = items.filter((item) => item.status !== "rejected").length >= max;
  const Icon = image ? ImageIcon : CloudUpload;

  return (
    <div className="fx-upload">
      <label
        className="fx-drop"
        data-dragging={dragging ? "" : undefined}
        data-full={full ? "" : undefined}
        data-invalid={invalid ? "" : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          if (!full) setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!full) add([...event.dataTransfer.files]);
        }}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="fx-sr-only"
          multiple={max > 1}
          accept={acceptAttribute(field)}
          disabled={full}
          onChange={(event) => {
            add([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={[describedBy, `${inputId}-limits`].filter(Boolean).join(" ")}
        />
        <span className="fx-drop-icon" aria-hidden>
          <Icon strokeWidth={2.25} size={26} />
        </span>
        <span className="fx-drop-text">
          <span className="fx-drop-title">{labels.chooseFile}</span>
          <span className="fx-muted">{labels.dropFiles}</span>
        </span>
        <span id={`${inputId}-limits`} className="fx-drop-limits">
          {copy.filesHint(max, formatBytes(limit))}
        </span>
      </label>
      {items.length ? (
        <ul className="fx-files" data-images={image ? "" : undefined}>
          {items.map((item) => (
            <li key={item.id} className="fx-file" data-status={item.status}>
              <span className="fx-file-thumb" aria-hidden>
                {item.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.preview} alt="" />
                ) : (
                  <FileIcon strokeWidth={2.25} size={20} />
                )}
              </span>
              <span className="fx-file-body">
                <span className="fx-file-name">{item.name}</span>
                <span className="fx-file-meta">
                  {item.status === "uploading" ? (
                    <>
                      <LoaderCircle aria-hidden className="fx-spin" strokeWidth={2.25} size={14} />
                      {labels.uploading} {Math.round(item.progress * 100)}%
                    </>
                  ) : item.status === "error" || item.status === "rejected" ? (
                    <>
                      <CircleAlert aria-hidden strokeWidth={2.25} size={14} />
                      {item.message}
                    </>
                  ) : (
                    formatBytes(item.size)
                  )}
                </span>
                {item.status === "uploading" ? (
                  <span
                    className="fx-file-bar"
                    role="progressbar"
                    aria-label={`${labels.uploading} ${item.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(item.progress * 100)}
                    style={{ ["--p" as string]: item.progress } as React.CSSProperties}
                  />
                ) : null}
              </span>
              {item.status === "error" ? (
                <button
                  type="button"
                  className="fx-icon-button"
                  onClick={() => {
                    start(item);
                  }}
                  aria-label={`${copy.retryUpload}: ${item.name}`}
                >
                  <RotateCcw aria-hidden strokeWidth={2.25} size={16} />
                </button>
              ) : null}
              <button
                type="button"
                className="fx-icon-button"
                onClick={() => {
                  remove(item);
                }}
                aria-label={copy.removeFile(item.name)}
              >
                <X aria-hidden strokeWidth={2.25} size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="fx-sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
