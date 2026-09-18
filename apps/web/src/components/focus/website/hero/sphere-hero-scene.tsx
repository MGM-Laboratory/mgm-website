"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Lightformer, MeshTransmissionMaterial } from "@react-three/drei";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// Design reference is a 1600x950 capture of the hero this was measured
// against pixel-by-pixel — positions/radii below are fractions of that
// frame, converted to three.js units at render time via the live viewport,
// so the composition scales with the canvas instead of being pinned to one
// resolution.
const REF_W = 1600;
const REF_H = 950;

// Lines/dots/points on the abstract spheres flip for contrast — white marks
// vanish on a light page background the same way dark ones vanish on the
// near-black one.
const WIRE_LIGHT = "#0e1116"; // mirrors --ink
const WIRE_DARK = "#f5f6f8";
const BASE_DARK = "#08090b"; // near-black glass base every opaque content sphere shares

type SphereKind =
  | "chrome"
  | "wire-network"
  | "wire-grid"
  | "glass-gems"
  | "code"
  | "chart"
  | "badge"
  | "urchin"
  | "particle-cloud"
  | "photo";

type SphereDef = {
  id: string;
  kind: SphereKind;
  xPx: number;
  yPx: number;
  radiusPx: number;
  photo?: string;
  photoFit?: "cover" | "contain";
};

// Measured directly off the reference screenshot as x%/y%/diameter% of the
// frame, then converted to this 1600x950 reference space — not eyeballed.
const SPHERES: SphereDef[] = [
  { id: "chrome", kind: "chrome", xPx: 1016, yPx: 152, radiusPx: 104 },
  {
    id: "photo-desk",
    kind: "photo",
    xPx: 832,
    yPx: 171,
    radiusPx: 96,
    photo: "/focus/website/photos/bright-desk.jpg",
  },
  { id: "network", kind: "wire-network", xPx: 1184, yPx: 200, radiusPx: 76 },
  { id: "gems", kind: "glass-gems", xPx: 1208, yPx: 352, radiusPx: 56 },
  { id: "chart", kind: "chart", xPx: 640, yPx: 266, radiusPx: 92 },
  { id: "cloud", kind: "particle-cloud", xPx: 432, yPx: 418, radiusPx: 88 },
  { id: "urchin", kind: "urchin", xPx: 1088, yPx: 456, radiusPx: 80 },
  { id: "badge", kind: "badge", xPx: 408, yPx: 599, radiusPx: 72 },
  { id: "grid", kind: "wire-grid", xPx: 432, yPx: 703, radiusPx: 96 },
  { id: "code", kind: "code", xPx: 616, yPx: 684, radiusPx: 104 },
  {
    id: "screenshot",
    kind: "photo",
    xPx: 900,
    yPx: 646,
    radiusPx: 116,
    photo: "/focus/website/photos/site-screenshot.png",
    photoFit: "contain",
  },
];

// The desktop cluster overlaps the headline on purpose — that column is
// much narrower and taller on mobile, so reusing the same coordinates put
// spheres straight on top of body text. A separate reference frame (a
// 390-wide phone, matched to the content block's real empty margins) with
// fewer, smaller spheres kept in those margins and the far edges instead.
const MOBILE_REF_W = 390;
const MOBILE_REF_H = 844;
const MOBILE_SPHERES: SphereDef[] = [
  { id: "chrome", kind: "chrome", xPx: 195, yPx: 105, radiusPx: 58 },
  { id: "network", kind: "wire-network", xPx: 355, yPx: 85, radiusPx: 42 },
  { id: "cloud", kind: "particle-cloud", xPx: -5, yPx: 420, radiusPx: 46 },
  { id: "grid", kind: "wire-grid", xPx: 45, yPx: 740, radiusPx: 66 },
  { id: "code", kind: "code", xPx: 335, yPx: 770, radiusPx: 55 },
  { id: "urchin", kind: "urchin", xPx: 195, yPx: 810, radiusPx: 35 },
];

function pxToUnits(
  viewport: { width: number; height: number },
  xPx: number,
  yPx: number,
  refW: number,
  refH: number,
) {
  return new THREE.Vector3(
    ((xPx - refW / 2) / refW) * viewport.width,
    -((yPx - refH / 2) / refH) * viewport.height,
    0,
  );
}

function radiusToUnits(viewport: { width: number }, radiusPx: number, refW: number) {
  return (radiusPx / refW) * viewport.width;
}

function makeCanvas(w: number, h: number, fill?: string) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  if (fill) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, w, h);
    }
  }
  return canvas;
}

// ---- individual sphere materials -----------------------------------------

function ChromeBall({ radius }: Readonly<{ radius: number }>) {
  return (
    <mesh>
      <sphereGeometry args={[radius, 48, 48]} />
      <meshStandardMaterial
        color="#eef0f3"
        metalness={0.9}
        roughness={0.16}
        envMapIntensity={1.8}
      />
    </mesh>
  );
}

function WireGlobeBall({
  radius,
  dark,
  dense,
}: Readonly<{ radius: number; dark: boolean; dense: boolean }>) {
  const color = dark ? WIRE_DARK : WIRE_LIGHT;
  const geometry = dense ? (
    <sphereGeometry args={[radius, 20, 14]} />
  ) : (
    <icosahedronGeometry args={[radius, 2]} />
  );
  return (
    <group>
      {/* Fully solid core — a translucent one let the page bleed through and
          read as washed-out rather than as a physical object. */}
      <mesh>
        <sphereGeometry args={[radius * 0.97, 32, 32]} />
        <meshStandardMaterial color={dark ? "#050506" : "#ffffff"} roughness={0.6} />
      </mesh>
      <mesh>
        {geometry}
        <meshBasicMaterial color={color} wireframe transparent opacity={0.4} />
      </mesh>
      <points>
        {geometry}
        <pointsMaterial color={color} size={radius * 0.05} sizeAttenuation />
      </points>
    </group>
  );
}

function GlassGemsBall({ radius }: Readonly<{ radius: number }>) {
  const gemColors = ["#3a6dc5", "#f94141", "#f7bf33", "#0f8657"];
  return (
    <group>
      <mesh>
        <sphereGeometry args={[radius, 48, 48]} />
        <MeshTransmissionMaterial
          color="#f5f6f8"
          transmission={1}
          roughness={0.08}
          thickness={radius}
          ior={1.3}
          chromaticAberration={0.03}
          anisotropy={0.1}
        />
      </mesh>
      {gemColors.map((color, i) => {
        const a = (i / gemColors.length) * Math.PI * 2;
        const r = radius * 0.4;
        return (
          <mesh
            key={color}
            position={[Math.cos(a) * r, Math.sin(a) * r * 0.6, Math.sin(a) * r * 0.3]}
            rotation={[a, a * 0.5, 0]}
          >
            <tetrahedronGeometry args={[radius * 0.22]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}

function UrchinBall({ radius }: Readonly<{ radius: number }>) {
  const geometry = useMemo(() => {
    const points: number[] = [];
    const rand = (seed: number) => {
      const x = Math.sin(seed * 999) * 10000;
      return x - Math.floor(x);
    };
    for (let i = 0; i < 110; i++) {
      const theta = rand(i * 2) * Math.PI * 2;
      const phi = Math.acos(2 * rand(i * 2 + 1) - 1);
      const dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi),
      );
      points.push(dir.x * radius * 0.25, dir.y * radius * 0.25, dir.z * radius * 0.25);
      points.push(dir.x * radius, dir.y * radius, dir.z * radius);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return geo;
  }, [radius]);

  return (
    <group>
      <mesh>
        <sphereGeometry args={[radius * 0.22, 16, 16]} />
        <meshBasicMaterial color="#050506" />
      </mesh>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color="#d6d9de" transparent opacity={0.75} />
      </lineSegments>
    </group>
  );
}

// A dense, soft-edged shell of points rather than a solid surface — reads as
// a nebula/dot-cloud, matching the reference's one non-wireframe "grainy"
// sphere. Seeded (not Math.random) so it doesn't reshape on every re-render.
function ParticleCloudBall({ radius, dark }: Readonly<{ radius: number; dark: boolean }>) {
  const geometry = useMemo(() => {
    const count = 2600;
    const positions = new Float32Array(count * 3);
    const rand = (seed: number) => {
      const x = Math.sin(seed * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    for (let i = 0; i < count; i++) {
      const theta = rand(i * 2.13) * Math.PI * 2;
      const phi = Math.acos(2 * rand(i * 2.13 + 0.7) - 1);
      const r = radius * (0.5 + 0.5 * rand(i * 2.13 + 1.3));
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [radius]);

  return (
    <points geometry={geometry}>
      <pointsMaterial
        color={dark ? WIRE_DARK : WIRE_LIGHT}
        size={radius * 0.032}
        sizeAttenuation
        transparent
        opacity={0.6}
        depthWrite={false}
      />
    </points>
  );
}

// A CanvasTexture wrapped on a full sphere maps the whole square around the
// entire globe, so content drawn edge-to-edge lands tiny and distorted on
// the front-facing patch the camera actually sees. Filling the canvas with
// the sphere's own base color first and only drawing inside a generous
// centered box keeps the wraparound sides a flat, invisible color and the
// content itself undistorted on the front cap.
function CanvasTextureBall({
  radius,
  draw,
  deps,
  baseColor = BASE_DARK,
  roughness = 0.4,
  metalness = 0.05,
  clearcoat = 0.5,
}: Readonly<{
  radius: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  deps: unknown[];
  baseColor?: string;
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
}>) {
  const size = 1024;
  const margin = size * 0.28;
  const contentSize = size - margin * 2;
  const [texture] = useState(() => {
    const t = new THREE.CanvasTexture(makeCanvas(size, size, baseColor));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });

  useLayoutEffect(() => {
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);
    ctx.translate(margin, margin);
    draw(ctx, contentSize, contentSize);
    ctx.restore();
    // A CanvasTexture's own redraw flag — three.js's normal mutable-object
    // idiom, not React state; see lanyard.tsx's identical suppression.
    // eslint-disable-next-line react-hooks/immutability
    texture.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return (
    <mesh>
      <sphereGeometry args={[radius, 64, 64]} />
      <meshPhysicalMaterial
        map={texture}
        roughness={roughness}
        metalness={metalness}
        clearcoat={clearcoat}
        clearcoatRoughness={0.25}
      />
    </mesh>
  );
}

const CODE_SNIPPET = [
  "gsap.timeline()",
  '  .to(".hero-word", {',
  "    yPercent: 0,",
  '    ease: "power4.out",',
  "    stagger: .045",
  "  });",
];

function CodeBall({ radius }: Readonly<{ radius: number }>) {
  return (
    <CanvasTextureBall
      radius={radius}
      deps={[]}
      draw={(ctx, w, h) => {
        ctx.fillStyle = "rgba(245,246,248,0.9)";
        ctx.font = `${Math.round(h * 0.078)}px ui-monospace, monospace`;
        ctx.textBaseline = "top";
        const lineHeight = h * 0.115;
        const startY = h / 2 - (CODE_SNIPPET.length * lineHeight) / 2;
        CODE_SNIPPET.forEach((line, i) => {
          ctx.fillText(line, 0, startY + i * lineHeight);
        });
      }}
    />
  );
}

function ChartBall({ radius }: Readonly<{ radius: number }>) {
  return (
    <CanvasTextureBall
      radius={radius}
      deps={[]}
      baseColor="#f5f6f8"
      roughness={0.25}
      metalness={0}
      draw={(ctx, w, h) => {
        ctx.strokeStyle = "rgba(14,17,22,0.15)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, h * 0.78);
        ctx.lineTo(w, h * 0.78);
        ctx.stroke();

        const pts: [number, number][] = [
          [0, 0.55],
          [0.16, 0.32],
          [0.32, 0.6],
          [0.48, 0.22],
          [0.64, 0.46],
          [0.8, 0.18],
          [1, 0.35],
        ];
        ctx.strokeStyle = "#3a6dc5";
        ctx.lineWidth = h * 0.028;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        pts.forEach(([px, py], i) => {
          const x = px * w;
          const y = py * h * 0.65;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        ctx.fillStyle = "rgba(14,17,22,0.5)";
        ctx.font = `${Math.round(h * 0.058)}px ui-monospace, monospace`;
        ctx.textBaseline = "top";
        ctx.fillText("May 31", 0, h * 0.84);
        ctx.textAlign = "right";
        ctx.fillText("June 4", w, h * 0.84);
      }}
    />
  );
}

function BadgeBall({ radius }: Readonly<{ radius: number }>) {
  return (
    <CanvasTextureBall
      radius={radius}
      deps={[]}
      baseColor="#3a6dc5"
      // Matte, not glossy — a specular hotspot from the Lightformer rig sits
      // roughly front-center on every sphere, which is exactly where this
      // one's text is, so cut roughness/clearcoat to keep it legible.
      roughness={0.9}
      metalness={0}
      clearcoat={0}
      draw={(ctx, w, h) => {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.font = `700 ${Math.round(h * 0.26)}px system-ui, sans-serif`;
        ctx.fillText("MGM", w / 2, h * 0.42);
        ctx.font = `600 ${Math.round(h * 0.09)}px ui-monospace, monospace`;
        ctx.fillText("LABORATORY", w / 2, h * 0.62);
      }}
    />
  );
}

// Real repo photography instead of the reference's own product content —
// loaded onto the same "solid fill first, content in a centered box" canvas
// as the drawn spheres, cover-cropped so nothing stretches.
function PhotoBall({
  radius,
  src,
  fit = "cover",
}: Readonly<{ radius: number; src: string; fit?: "cover" | "contain" }>) {
  const size = 1024;
  const margin = size * 0.22;
  const boxSize = size - margin * 2;
  const [texture] = useState(() => {
    const t = new THREE.CanvasTexture(makeCanvas(size, size, BASE_DARK));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = texture.image as HTMLCanvasElement;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = BASE_DARK;
      ctx.fillRect(0, 0, size, size);
      // "contain" for a wide screenshot — a "cover" crop on a ~16:10 image
      // squeezed into a square box slices straight through the middle of a
      // word; showing the whole frame, letterboxed, reads as an actual page
      // instead of an unrecognizable fragment.
      const pick = fit === "contain" ? Math.min : Math.max;
      const scale = pick(boxSize / img.width, boxSize / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = margin + (boxSize - dw) / 2;
      const dy = margin + (boxSize - dh) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(margin, margin, boxSize, boxSize);
      ctx.clip();
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
      // A CanvasTexture's own redraw flag — see CanvasTextureBall above.
      texture.needsUpdate = true;
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, texture, boxSize, margin, fit]);

  return (
    <mesh>
      <sphereGeometry args={[radius, 64, 64]} />
      <meshPhysicalMaterial
        map={texture}
        roughness={0.35}
        metalness={0.05}
        clearcoat={0.6}
        clearcoatRoughness={0.2}
      />
    </mesh>
  );
}

// ---- scene body: positions everything and owns the GSAP timelines --------

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const sync = () => setIsMobile(window.innerWidth < 640);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);
  return isMobile;
}

function SceneBody({
  sectionEl,
  play,
  reduced,
  dark,
}: Readonly<{
  sectionEl: HTMLElement | null;
  play: boolean;
  reduced: boolean;
  dark: boolean;
}>) {
  const { viewport } = useThree();
  const groupRefs = useRef<Record<string, THREE.Group | null>>({});
  const isMobile = useIsMobile();
  const spheres = isMobile ? MOBILE_SPHERES : SPHERES;
  const refW = isMobile ? MOBILE_REF_W : REF_W;
  const refH = isMobile ? MOBILE_REF_H : REF_H;

  const layout = useMemo(() => {
    const map: Record<string, { final: THREE.Vector3; start: THREE.Vector3; radius: number }> = {};
    for (const s of spheres) {
      const final = pxToUnits(viewport, s.xPx, s.yPx, refW, refH);
      const dir = final.clone().setZ(0);
      if (dir.lengthSq() < 0.0001) dir.set(0, 1, 0);
      dir.normalize();
      const start = final.clone().add(dir.multiplyScalar(viewport.width * 1.1));
      map[s.id] = { final, start, radius: radiusToUnits(viewport, s.radiusPx, refW) };
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.width, viewport.height, spheres, refW, refH]);

  // Entrance: spheres fly in from off-canvas and converge on their resting
  // cluster position — mirrors the reference's "already in motion,
  // converging inward" reveal rather than scaling up from nothing.
  useEffect(() => {
    if (!play) return;
    const groups = spheres
      .map((s) => groupRefs.current[s.id])
      .filter((g): g is THREE.Group => Boolean(g));
    if (reduced) {
      groups.forEach((g) => {
        const l = layout[g.userData.id as string];
        if (l) g.position.copy(l.final);
      });
      return;
    }
    groups.forEach((g) => {
      const l = layout[g.userData.id as string];
      if (l) g.position.copy(l.start);
    });
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    groups.forEach((g, i) => {
      const l = layout[g.userData.id as string];
      if (!l) return;
      tl.to(g.position, { x: l.final.x, y: l.final.y, duration: 0.7 }, i * 0.035);
    });
    return () => {
      tl.kill();
    };
  }, [play, reduced, layout, spheres]);

  // Exit: scrolling past the hero shrinks the whole cluster away — the
  // sphere-side half of the reference's "dim and vanish" reverse-entrance;
  // the headline's half of that lives in focus-hero.tsx against the same
  // trigger element so both halves stay in lockstep.
  useLayoutEffect(() => {
    if (reduced || !sectionEl) return undefined;
    const groups = spheres
      .map((s) => groupRefs.current[s.id])
      .filter((g): g is THREE.Group => Boolean(g));
    if (!groups.length) return undefined;

    const tl = gsap.timeline({
      scrollTrigger: { trigger: sectionEl, start: "top top", end: "+=55%", scrub: true },
    });
    groups.forEach((g, i) => {
      tl.to(g.scale, { x: 0, y: 0, z: 0, ease: "power1.in" }, i * 0.01);
    });
    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, [reduced, sectionEl, spheres]);

  return (
    <>
      {spheres.map((s) => {
        const l = layout[s.id];
        if (!l) return null;
        return (
          <group
            key={s.id}
            ref={(el) => {
              groupRefs.current[s.id] = el;
              if (el) el.userData.id = s.id;
            }}
            position={reduced ? l.final : l.start}
          >
            {s.kind === "chrome" && <ChromeBall radius={l.radius} />}
            {s.kind === "wire-network" && (
              <WireGlobeBall radius={l.radius} dark={dark} dense={false} />
            )}
            {s.kind === "wire-grid" && <WireGlobeBall radius={l.radius} dark={dark} dense />}
            {s.kind === "glass-gems" && <GlassGemsBall radius={l.radius} />}
            {s.kind === "urchin" && <UrchinBall radius={l.radius} />}
            {s.kind === "particle-cloud" && <ParticleCloudBall radius={l.radius} dark={dark} />}
            {s.kind === "code" && <CodeBall radius={l.radius} />}
            {s.kind === "chart" && <ChartBall radius={l.radius} />}
            {s.kind === "badge" && <BadgeBall radius={l.radius} />}
            {s.kind === "photo" && s.photo && (
              <PhotoBall radius={l.radius} src={s.photo} fit={s.photoFit} />
            )}
          </group>
        );
      })}
    </>
  );
}

export type SphereHeroSceneProps = {
  sectionEl: HTMLElement | null;
  play: boolean;
  reducedMotion: boolean;
  dark: boolean;
};

export default function SphereHeroScene({
  sectionEl,
  play,
  reducedMotion,
  dark,
}: SphereHeroSceneProps) {
  return (
    <Canvas
      className="!absolute !inset-0"
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 0, 20], fov: 32 }}
      onCreated={({ gl }) => gl.setClearColor(new THREE.Color(0x000000), 0)}
      frameloop={reducedMotion ? "demand" : "always"}
      style={{ pointerEvents: "none" }}
    >
      <ambientLight intensity={0.7} />
      {/* A wide, soft Lightformer rig — chrome and the clearcoat content
          spheres need coverage from several directions or they read as
          near-black with a couple of blown-out hotspots instead of a
          smooth, glossy gradient. */}
      <Environment blur={0.65} resolution={256}>
        <Lightformer intensity={3.2} color="white" position={[4, 4, 6]} scale={[8, 8, 1]} />
        <Lightformer intensity={2} color="white" position={[-5, -1, 4]} scale={[8, 8, 1]} />
        <Lightformer intensity={2} color="white" position={[0, -5, 5]} scale={[10, 4, 1]} />
        <Lightformer intensity={1.5} color="#3a6dc5" position={[-4, 5, -2]} scale={[10, 10, 1]} />
        <Lightformer intensity={1.8} color="white" position={[5, 0, -4]} scale={[10, 10, 1]} />
      </Environment>
      <SceneBody sectionEl={sectionEl} play={play} reduced={reducedMotion} dark={dark} />
    </Canvas>
  );
}
