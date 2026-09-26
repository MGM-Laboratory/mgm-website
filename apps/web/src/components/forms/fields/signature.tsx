"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Eraser, LoaderCircle } from "lucide-react";
import { isFileAnswer, type FormFileAnswer } from "@repo/shared";

import { useFormController, type FieldProps } from "../form-context";
import { useUploader } from "./upload";

/**
 * A signature pad: draw with a finger, pen or mouse (pointer events, with
 * pressure where the pen has it), or type a name for a written signature
 * (the keyboard route). Each finished stroke is exported as a PNG and
 * uploaded like an image; the answer is that one file.
 */
export function SignatureField({
  field,
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
}: FieldProps<FormFileAnswer[]>) {
  const { copy, language } = useFormController();
  const uploadOne = useUploader(field);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [empty, setEmpty] = useState(!isFileAnswer(value) || !value.length);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    isFileAnswer(value) && value.length ? "saved" : "idle",
  );
  const [typed, setTyped] = useState("");
  const saveTimer = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const version = useRef(0);

  const ink = () => {
    const canvas = canvasRef.current;
    return canvas ? getComputedStyle(canvas).color : "#0e1116";
  };

  // Keeps the backing store at the element's size times the pixel ratio.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.round(rect.width * ratio);
      const height = Math.round(rect.height * ratio);
      if (canvas.width === width && canvas.height === height) return;
      const snapshot = canvas.width && canvas.height ? canvas.toDataURL() : null;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (snapshot) {
        const image = new Image();
        image.onload = () => {
          context.drawImage(image, 0, 0, rect.width, rect.height);
        };
        image.src = snapshot;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      window.clearTimeout(saveTimer.current);
      abortRef.current?.abort();
    };
  }, []);

  const save = () => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const mine = (version.current += 1);
      setStatus("saving");
      // The stored signature is dark ink on transparent, whatever the page's
      // scheme drew it in, so it reads in the admin's light workspace.
      const out = document.createElement("canvas");
      out.width = canvas.width;
      out.height = canvas.height;
      const context = out.getContext("2d");
      if (context) {
        context.drawImage(canvas, 0, 0);
        context.globalCompositeOperation = "source-in";
        context.fillStyle = "#0e1116";
        context.fillRect(0, 0, out.width, out.height);
      }
      (context ? out : canvas).toBlob((blob) => {
        if (!blob || mine !== version.current) return;
        abortRef.current?.abort();
        const abort = new AbortController();
        abortRef.current = abort;
        uploadOne(blob, `signature-${field.id}.png`, () => undefined, abort.signal)
          .then((answer) => {
            if (mine !== version.current) return;
            onChange([answer]);
            setStatus("saved");
          })
          .catch(() => {
            if (!abort.signal.aborted) setStatus("error");
          });
      }, "image/png");
    }, 650);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.restore();
    }
    version.current += 1;
    abortRef.current?.abort();
    window.clearTimeout(saveTimer.current);
    setEmpty(true);
    setStatus("idle");
    setTyped("");
    onChange(undefined);
  };

  const drawTyped = (text: string) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    if (!text.trim()) {
      setEmpty(true);
      setStatus("idle");
      version.current += 1;
      onChange(undefined);
      return;
    }
    const family = getComputedStyle(canvas).getPropertyValue("--fx-signature-font") || "serif";
    let size = Math.min(56, rect.height * 0.42);
    context.fillStyle = ink();
    context.textBaseline = "middle";
    context.font = `italic 500 ${size}px ${family}`;
    while (context.measureText(text).width > rect.width - 48 && size > 16) {
      size -= 2;
      context.font = `italic 500 ${size}px ${family}`;
    }
    context.fillText(text, 24, rect.height * 0.55);
    setEmpty(false);
    save();
  };

  // Drawing: a quadratic curve through the midpoints, width from speed and pressure.
  const last = useRef<{ x: number; y: number; width: number } | null>(null);
  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    last.current = { x: event.clientX - rect.left, y: event.clientY - rect.top, width: 2.6 };
    window.clearTimeout(saveTimer.current);
    if (typed) setTyped("");
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const previous = last.current;
    if (!canvas || !context || !previous) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const distance = Math.hypot(x - previous.x, y - previous.y);
    if (distance < 1) return;
    const pressure = event.pressure && event.pointerType === "pen" ? event.pressure : 0.5;
    const target = Math.max(1.2, Math.min(4.2, (3.6 - distance * 0.06) * (0.6 + pressure)));
    const width = previous.width + (target - previous.width) * 0.35;
    context.strokeStyle = ink();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.quadraticCurveTo(previous.x, previous.y, (previous.x + x) / 2, (previous.y + y) / 2);
    context.lineTo(x, y);
    context.stroke();
    last.current = { x, y, width };
    if (empty) setEmpty(false);
  };
  const onPointerUp = () => {
    if (!last.current) return;
    last.current = null;
    if (!empty) save();
  };

  return (
    <div className="fx-signature" data-invalid={invalid ? "" : undefined}>
      <div className="fx-signature-pad" data-empty={empty ? "" : undefined}>
        <canvas
          ref={canvasRef}
          className="fx-signature-canvas"
          role="img"
          aria-label={copy.signHere}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <span className="fx-signature-line" aria-hidden />
        {empty ? (
          <span className="fx-signature-hint" aria-hidden>
            {copy.signHere}
          </span>
        ) : null}
      </div>
      <div className="fx-signature-bar">
        <label className="fx-sr-only" htmlFor={inputId}>
          {language === "id" ? "Atau ketik nama Anda" : "Or type your name"}
        </label>
        <input
          id={inputId}
          className="fx-input fx-signature-typed"
          type="text"
          value={typed}
          maxLength={80}
          placeholder={language === "id" ? "Atau ketik nama Anda" : "Or type your name"}
          onChange={(event) => {
            setTyped(event.target.value);
            drawTyped(event.target.value);
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete="name"
        />
        <span className="fx-signature-status" aria-live="polite">
          {status === "saving" ? (
            <LoaderCircle aria-hidden className="fx-spin" strokeWidth={2.25} size={16} />
          ) : status === "saved" ? (
            <>
              <Check aria-hidden strokeWidth={2.25} size={16} />
              {copy.signatureSaved}
            </>
          ) : status === "error" ? (
            copy.uploadFailed
          ) : null}
        </span>
        <button
          type="button"
          className="fx-button"
          data-variant="ghost"
          onClick={clear}
          disabled={empty}
        >
          <Eraser aria-hidden strokeWidth={2.25} size={16} />
          {copy.clearSignature}
        </button>
      </div>
    </div>
  );
}
