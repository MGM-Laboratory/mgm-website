"use client";

import { useEffect, useRef } from "react";
import type { FormCelebration } from "@repo/shared";

import { random } from "@/lib/random";
import { motionAllowed } from "@/lib/reduced-motion";

import { SHAPE_PATHS, SHAPE_KINDS, type ShapeKind } from "./scene/vocabulary";

/**
 * The ending's celebration, drawn on a 2D canvas over everything (so it
 * plays with or without WebGL): confetti of the brand's shapes tumbling in
 * 3D, fireworks that burst into rings of shapes, a bloom of petals from the
 * middle, or, for "assemble", a ring of sparks around the finished poster
 * (the scene itself does the assembling). Once, a few seconds, then the
 * canvas is gone. Nothing plays under reduced motion.
 */

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  angle: number;
  flip: number;
  flipSpeed: number;
  color: string;
  kind: ShapeKind;
  life: number;
  delay: number;
  drag: number;
  gravity: number;
};

const paths = new Map<ShapeKind, Path2D>();
function pathFor(kind: ShapeKind) {
  let path = paths.get(kind);
  if (path) return path;
  if (kind === "x")
    path = new Path2D("M14 26L26 14L50 38L74 14L86 26L62 50L86 74L74 86L50 62L26 86L14 74L38 50Z");
  else if (kind === "ring")
    path = new Path2D("M50 6a44 44 0 1 0 0.001 0ZM50 28a22 22 0 1 1 -0.001 0Z");
  else path = new Path2D(SHAPE_PATHS[kind]);
  paths.set(kind, path);
  return path;
}

function readColors(element: HTMLElement) {
  const style = getComputedStyle(element);
  const colors = [0, 1, 2, 3, 4]
    .map((index) => style.getPropertyValue(`--fx-piece-${index}`).trim())
    .filter(Boolean);
  return colors.length ? colors : ["#3a6dc5", "#f94141", "#f7bf33", "#0f8657"];
}

function seedParticles(kind: FormCelebration, width: number, height: number, colors: string[]) {
  const particles: Particle[] = [];
  const rand = random;
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const small = width < 640;
  const base = (): Particle => ({
    x: width / 2,
    y: height / 2,
    vx: 0,
    vy: 0,
    size: (small ? 10 : 14) + rand() * (small ? 10 : 16),
    spin: (rand() - 0.5) * 8,
    angle: rand() * Math.PI * 2,
    flip: rand() * Math.PI,
    flipSpeed: 3 + rand() * 6,
    color: pick(colors),
    kind: pick(SHAPE_KINDS),
    life: 1,
    delay: 0,
    drag: 0.985,
    gravity: 900,
  });

  if (kind === "confetti") {
    const count = small ? 90 : 170;
    for (let index = 0; index < count; index += 1) {
      const side = index % 3;
      const particle = base();
      if (side === 0) {
        particle.x = -20;
        particle.y = height * (0.55 + rand() * 0.3);
        particle.vx = 500 + rand() * 700;
        particle.vy = -(700 + rand() * 700);
      } else if (side === 1) {
        particle.x = width + 20;
        particle.y = height * (0.55 + rand() * 0.3);
        particle.vx = -(500 + rand() * 700);
        particle.vy = -(700 + rand() * 700);
      } else {
        particle.x = rand() * width;
        particle.y = -30 - rand() * height * 0.4;
        particle.vx = (rand() - 0.5) * 200;
        particle.vy = rand() * 200;
        particle.delay = rand() * 0.6;
      }
      particle.gravity = 1100;
      particle.drag = 0.975;
      particles.push(particle);
    }
  } else if (kind === "fireworks") {
    const bursts = small ? 4 : 6;
    for (let burst = 0; burst < bursts; burst += 1) {
      const cx = width * (0.18 + rand() * 0.64);
      const cy = height * (0.18 + rand() * 0.35);
      const color = pick(colors);
      const shape = pick(SHAPE_KINDS);
      const count = small ? 18 : 26;
      for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2;
        const speed = 380 + rand() * 120;
        const particle = base();
        particle.x = cx;
        particle.y = cy;
        particle.vx = Math.cos(angle) * speed;
        particle.vy = Math.sin(angle) * speed;
        particle.color = index % 4 === 0 ? pick(colors) : color;
        particle.kind = shape;
        particle.size *= 0.7;
        particle.delay = burst * 0.38;
        particle.gravity = 260;
        particle.drag = 0.955;
        particles.push(particle);
      }
    }
  } else if (kind === "bloom") {
    const rings = 4;
    for (let ring = 0; ring < rings; ring += 1) {
      const count = 10 + ring * 6;
      for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2 + ring * 0.3;
        const speed = 160 + ring * 110;
        const particle = base();
        particle.vx = Math.cos(angle) * speed;
        particle.vy = Math.sin(angle) * speed;
        particle.kind = ring % 2 ? "leaf" : "circle";
        particle.angle = angle + Math.PI / 4;
        particle.spin = 0.4;
        particle.flipSpeed = 0;
        particle.flip = 0;
        particle.delay = ring * 0.14;
        particle.gravity = 0;
        particle.drag = 0.962;
        particle.size *= 1 + ring * 0.25;
        particles.push(particle);
      }
    }
  } else if (kind === "assemble") {
    const poster = document.querySelector<HTMLElement>("[data-fx-poster]")?.getBoundingClientRect();
    const cx = poster ? poster.left + poster.width / 2 : width / 2;
    const cy = poster ? poster.top + poster.height / 2 : height / 2;
    const radius = poster ? poster.width * 0.62 : Math.min(width, height) * 0.3;
    const count = small ? 36 : 56;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      const particle = base();
      particle.x = cx + Math.cos(angle) * radius * 0.7;
      particle.y = cy + Math.sin(angle) * radius * 0.7;
      particle.vx = Math.cos(angle) * 240;
      particle.vy = Math.sin(angle) * 240;
      particle.size *= 0.55;
      particle.kind = index % 2 ? "plus" : "circle";
      particle.delay = 0.55 + (index % 8) * 0.03;
      particle.gravity = 0;
      particle.drag = 0.94;
      particles.push(particle);
    }
  }
  return particles;
}

export function Celebration({ kind, play }: { kind: FormCelebration; play: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !play || kind === "none" || !motionAllowed()) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const particles = seedParticles(kind, width, height, readColors(canvas));
    const duration = kind === "fireworks" ? 4.4 : 3.6;
    let frame = 0;
    let last = performance.now();
    let elapsed = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (document.hidden) {
        frame = requestAnimationFrame(tick);
        return;
      }
      elapsed += dt;
      context.clearRect(0, 0, width, height);
      for (const particle of particles) {
        if (elapsed < particle.delay) continue;
        particle.vx *= particle.drag;
        particle.vy = particle.vy * particle.drag + particle.gravity * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.angle += particle.spin * dt;
        particle.flip += particle.flipSpeed * dt;
        const age = (elapsed - particle.delay) / (duration - particle.delay);
        particle.life = Math.max(0, 1 - Math.max(0, age - 0.55) / 0.45);
        if (particle.life <= 0) continue;
        context.save();
        context.globalAlpha = particle.life;
        context.translate(particle.x, particle.y);
        context.rotate(particle.angle);
        context.scale(Math.cos(particle.flip) || 0.05, 1);
        const scale = particle.size / 100;
        context.scale(scale, scale);
        context.translate(-50, -50);
        context.fillStyle = particle.color;
        context.fill(pathFor(particle.kind), "evenodd");
        context.restore();
      }
      if (elapsed < duration) frame = requestAnimationFrame(tick);
      else context.clearRect(0, 0, width, height);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      context.clearRect(0, 0, width, height);
    };
  }, [kind, play]);

  if (kind === "none") return null;
  return <canvas ref={canvasRef} className="fx-celebration" aria-hidden />;
}
