"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DownloadSimple } from "@phosphor-icons/react";
import { encode } from "uqr";
import type { FormRecord } from "@repo/shared";

import { PROJECT_THEMES } from "@/lib/project-themes";

import { labelClass, selectClass } from "./share-ui";

const THEMES = new Map(Object.entries(PROJECT_THEMES));

type Ecc = "L" | "M" | "Q" | "H";

export type QrOptions = {
  ecc: Ecc;
  margin: number;
  colors: "theme" | "ink";
  logo: boolean;
};

const LOGO_FRACTION = 0.22;

export type QrModel = {
  total: number;
  path: string;
  version: number;
  modules: number;
  logo: { x: number; y: number; size: number } | null;
};

/** The QR modules as one SVG path, leaving a quiet square for the centre logo when asked. */
export function qrModel(text: string, options: QrOptions): QrModel {
  const qr = encode(text, {
    ecc: options.logo && (options.ecc === "L" || options.ecc === "M") ? "Q" : options.ecc,
    border: 0,
  });
  const size = qr.size;
  const margin = options.margin;
  const logoCells = options.logo ? Math.ceil(size * LOGO_FRACTION) | 1 : 0;
  const logoStart = Math.floor((size - logoCells) / 2);
  let path = "";
  for (const [y, line] of qr.data.entries()) {
    for (const [x, dark] of line.entries()) {
      if (!dark) continue;
      if (
        options.logo &&
        x >= logoStart - 1 &&
        x < logoStart + logoCells + 1 &&
        y >= logoStart - 1 &&
        y < logoStart + logoCells + 1
      )
        continue;
      path += `M${x + margin} ${y + margin}h1v1h-1z`;
    }
  }
  return {
    total: size + margin * 2,
    path,
    version: qr.version,
    modules: size,
    logo: options.logo ? { x: logoStart + margin, y: logoStart + margin, size: logoCells } : null,
  };
}

/** The same model as a standalone SVG file (colours are validated hex values). */
export function qrSvgString(model: QrModel, colors: { fg: string; bg: string }, logoHref?: string) {
  const logo =
    model.logo && logoHref
      ? `<rect x="${model.logo.x - 0.5}" y="${model.logo.y - 0.5}" width="${model.logo.size + 1}" height="${model.logo.size + 1}" rx="1.2" fill="${colors.bg}"/><image href="${logoHref}" x="${model.logo.x}" y="${model.logo.y}" width="${model.logo.size}" height="${model.logo.size}" preserveAspectRatio="xMidYMid meet"/>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${model.total} ${model.total}" width="1024" height="1024" shape-rendering="crispEdges"><rect width="${model.total}" height="${model.total}" fill="${colors.bg}"/><path d="${model.path}" fill="${colors.fg}"/>${logo}</svg>`;
}

function QrPreview({
  model,
  colors,
  label,
}: {
  model: QrModel;
  colors: { fg: string; bg: string };
  label: string;
}) {
  return (
    <svg
      aria-label={label}
      className="block size-full"
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${model.total} ${model.total}`}
    >
      <rect fill={colors.bg} height={model.total} width={model.total} />
      <path d={model.path} fill={colors.fg} />
      {model.logo ? (
        <>
          <rect
            fill={colors.bg}
            height={model.logo.size + 1}
            rx={1.2}
            width={model.logo.size + 1}
            x={model.logo.x - 0.5}
            y={model.logo.y - 0.5}
          />
          <image
            height={model.logo.size}
            href="/logo.svg"
            preserveAspectRatio="xMidYMid meet"
            width={model.logo.size}
            x={model.logo.x}
            y={model.logo.y}
          />
        </>
      ) : null}
    </svg>
  );
}

const HEX = /^#[0-9a-f]{3,8}$/i;

/** The site logo as a data URL, or undefined when it can't be fetched. */
async function fetchLogoDataUrl(): Promise<string | undefined> {
  return fetch("/logo.svg")
    .then(async (request) => {
      if (!request.ok) return undefined;
      const text = await request.text();
      return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
    })
    .catch(() => undefined);
}

function download(href: string, name: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** A QR code of the chosen link, styled and downloadable as SVG or a 1024 px PNG. */
export function QrCard({
  form,
  targets,
}: {
  form: FormRecord;
  targets: { label: string; url: string }[];
}) {
  const [targetUrl, setTargetUrl] = useState(targets[0]?.url ?? "");
  const [options, setOptions] = useState<QrOptions>({
    ecc: "M",
    margin: 2,
    colors: "theme",
    logo: false,
  });
  const url = targets.some((target) => target.url === targetUrl)
    ? targetUrl
    : (targets[0]?.url ?? "");
  const palette = THEMES.get(form.document.design.theme)?.light;
  const colors =
    options.colors === "theme" && palette && HEX.test(palette.text) && HEX.test(palette.bg)
      ? { fg: palette.text, bg: palette.bg }
      : { fg: "#0e1116", bg: "#ffffff" };
  const preview = useMemo(() => (url ? qrModel(url, options) : null), [url, options]);

  const fileStem = `${form.slug}-qr`;
  const downloadSvg = async () => {
    if (!url) return;
    const logo = options.logo ? await fetchLogoDataUrl() : undefined;
    const svg = qrSvgString(qrModel(url, options), colors, logo);
    const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    download(blobUrl, `${fileStem}.svg`);
    window.setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 20_000);
  };
  const downloadPng = async () => {
    if (!url) return;
    try {
      const logo = options.logo ? await fetchLogoDataUrl() : undefined;
      const svg = qrSvgString(qrModel(url, options), colors, logo);
      const image = new Image();
      image.decoding = "async";
      const source = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => {
          resolve();
        };
        image.onerror = () => {
          reject(new Error("The QR image did not render."));
        };
        image.src = source;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1024;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is not available.");
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, 1024, 1024);
      download(canvas.toDataURL("image/png"), `${fileStem}.png`);
    } catch (error) {
      toast.error("Could not make the PNG", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]"
      data-testid="qr-card"
    >
      <div className="mx-auto w-full max-w-[220px]">
        {preview ? (
          <div className="aspect-square w-full overflow-hidden rounded-2xl border border-[#e4e8f0] dark:border-white/10">
            <QrPreview colors={colors} label={`QR code for ${url}`} model={preview} />
          </div>
        ) : null}
        {preview ? (
          <p className="mt-1.5 text-center text-[10px] text-[#8a93a6]">
            Version {preview.version} · {preview.modules} × {preview.modules}
          </p>
        ) : null}
      </div>
      <div className="min-w-0 space-y-3">
        <label className="block">
          <span className={`${labelClass} mb-1 block`}>Link</span>
          <select
            className={selectClass}
            onChange={(event) => {
              setTargetUrl(event.target.value);
            }}
            value={url}
          >
            {targets.map((target) => (
              <option key={target.url} value={target.url}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={`${labelClass} mb-1 block`}>Colours</span>
            <select
              className={selectClass}
              onChange={(event) => {
                setOptions((current) => ({
                  ...current,
                  colors: event.target.value as QrOptions["colors"],
                }));
              }}
              value={options.colors}
            >
              <option value="theme">Form theme</option>
              <option value="ink">Ink on white</option>
            </select>
          </label>
          <label className="block">
            <span className={`${labelClass} mb-1 block`}>Error correction</span>
            <select
              className={selectClass}
              onChange={(event) => {
                setOptions((current) => ({ ...current, ecc: event.target.value as Ecc }));
              }}
              value={options.ecc}
            >
              <option value="L">Low (7%)</option>
              <option value="M">Medium (15%)</option>
              <option value="Q">Quartile (25%)</option>
              <option value="H">High (30%)</option>
            </select>
          </label>
          <label className="block">
            <span className={`${labelClass} mb-1 block`}>Margin: {options.margin}</span>
            <input
              aria-label="Margin"
              className="mt-2 w-full accent-brand-blue"
              max={8}
              min={0}
              onChange={(event) => {
                setOptions((current) => ({ ...current, margin: Number(event.target.value) }));
              }}
              type="range"
              value={options.margin}
            />
          </label>
          <label className="mt-5 flex items-center gap-2 text-sm">
            <input
              checked={options.logo}
              className="size-4 accent-brand-blue"
              onChange={(event) => {
                setOptions((current) => ({ ...current, logo: event.target.checked }));
              }}
              type="checkbox"
            />
            Centre logo
          </label>
        </div>
        {options.logo && (options.ecc === "L" || options.ecc === "M") ? (
          <p className="text-[11px] text-[#8a93a6]">
            With a logo the code uses at least Quartile correction so it still scans.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#d9dfeb] px-3 text-sm font-semibold hover:border-brand-blue hover:text-brand-blue dark:border-white/10"
            onClick={() => void downloadSvg()}
            type="button"
          >
            <DownloadSimple size={15} /> SVG
          </button>
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#d9dfeb] px-3 text-sm font-semibold hover:border-brand-blue hover:text-brand-blue dark:border-white/10"
            onClick={() => void downloadPng()}
            type="button"
          >
            <DownloadSimple size={15} /> PNG 1024 px
          </button>
        </div>
      </div>
    </div>
  );
}
