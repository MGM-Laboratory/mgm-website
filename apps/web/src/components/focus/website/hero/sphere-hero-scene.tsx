"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Lightformer, MeshTransmissionMaterial } from "@react-three/drei";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { WEBSITE_FOCUS_STACK } from "@/data/website-focus";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// Design reference is the 1600x950 desktop capture the layout was measured
// against (see the research screenshots) — positions/radii below are
// fractions of that frame, converted to three.js units at render time via
// the live viewport, so the composition scales with the canvas instead of
// being pinned to one resolution.
const REF_W = 1600;
const REF_H = 950;

// Lines/dots on the two wireframe "planet" spheres have to flip for
// contrast — white dots vanish on a light page background the same way
// dark ones vanish on the near-black one.
const WIRE_LIGHT = "#0e1116"; // mirrors --ink
const WIRE_DARK = "#f5f6f8";

type SphereKind =
  "chrome" | "wire-network" | "wire-grid" | "glass-gems" | "code" | "cycle" | "badge" | "urchin";

type SphereDef = {
  id: string;
  kind: SphereKind;
  xPx: number;
  yPx: number;
  radiusPx: number;
};

const SPHERES: SphereDef[] = [
  { id: "chrome", kind: "chrome", xPx: 958, yPx: 275, radiusPx: 95 },
  { id: "network", kind: "wire-network", xPx: 1145, yPx: 275, radiusPx: 90 },
  { id: "gems", kind: "glass-gems", xPx: 1205, yPx: 345, radiusPx: 55 },
  { id: "urchin", kind: "urchin", xPx: 1160, yPx: 475, radiusPx: 60 },
  // Kept clear of the footer row's "scroll to the stack" pill (see
  // focus-hero.tsx) — a lower yPx here sat directly behind it, hiding the
  // canvas-drawn wordmark under the DOM pill every time.
  { id: "badge", kind: "badge", xPx: 1180, yPx: 570, radiusPx: 75 },
  { id: "code", kind: "code", xPx: 735, yPx: 605, radiusPx: 95 },
  { id: "grid", kind: "wire-grid", xPx: 520, yPx: 650, radiusPx: 105 },
  { id: "cycle", kind: "cycle", xPx: 745, yPx: 320, radiusPx: 90 },
];

// The desktop cluster overlaps the headline/tagline column on purpose —
// that column is much narrower and taller on mobile, so reusing the same
// coordinates put spheres straight on top of body text and the CTA pill.
// This is a separate reference frame (a 390-wide phone, matched to the
// content block's actual empty margins above/below it) with fewer, smaller
// spheres kept in those margins and the far edges instead.
const MOBILE_REF_W = 390;
const MOBILE_REF_H = 844;
const MOBILE_SPHERES: SphereDef[] = [
  { id: "chrome", kind: "chrome", xPx: 195, yPx: 105, radiusPx: 58 },
  { id: "network", kind: "wire-network", xPx: 355, yPx: 85, radiusPx: 42 },
  { id: "cycle", kind: "cycle", xPx: -5, yPx: 420, radiusPx: 40 },
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

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

// ---- individual sphere materials -----------------------------------------

function ChromeBall({ radius }: Readonly<{ radius: number }>) {
  return (
    <mesh>
      <sphereGeometry args={[radius, 48, 48]} />
      <meshStandardMaterial
        color="#eef0f3"
        metalness={0.85}
        roughness={0.22}
        envMapIntensity={1.6}
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
      <mesh>
        {geometry}
        <meshBasicMaterial color={color} wireframe transparent opacity={0.35} />
      </mesh>
      <points>
        {geometry}
        <pointsMaterial color={color} size={radius * 0.045} sizeAttenuation />
      </points>
      {/* Solid dark core so the wireframe reads as a sphere, not a scribble. */}
      <mesh>
        <sphereGeometry args={[radius * 0.97, 32, 32]} />
        <meshBasicMaterial color={dark ? "#000000" : "#ffffff"} transparent opacity={0.55} />
      </mesh>
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
    for (let i = 0; i < 90; i++) {
      const theta = rand(i * 2) * Math.PI * 2;
      const phi = Math.acos(2 * rand(i * 2 + 1) - 1);
      const dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi),
      );
      points.push(dir.x * radius * 0.3, dir.y * radius * 0.3, dir.z * radius * 0.3);
      points.push(dir.x * radius, dir.y * radius, dir.z * radius);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return geo;
  }, [radius]);

  return (
    <group>
      <mesh>
        <sphereGeometry args={[radius * 0.28, 16, 16]} />
        <meshBasicMaterial color="#0e1116" />
      </mesh>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color="#c7cbd1" transparent opacity={0.7} />
      </lineSegments>
    </group>
  );
}

function CanvasTextureBall({
  radius,
  draw,
  deps,
  roughness = 0.55,
  metalness = 0.1,
}: Readonly<{
  radius: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  deps: unknown[];
  roughness?: number;
  metalness?: number;
}>) {
  const size = 512;
  const [texture] = useState(() => {
    const t = new THREE.CanvasTexture(makeCanvas(size, size));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });

  useLayoutEffect(() => {
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    draw(ctx, size, size);
    // A CanvasTexture's own redraw flag — three.js's normal mutable-object
    // idiom, not React state; see lanyard.tsx's identical suppression.
    // eslint-disable-next-line react-hooks/immutability
    texture.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return (
    <mesh>
      <sphereGeometry args={[radius, 48, 48]} />
      <meshStandardMaterial map={texture} roughness={roughness} metalness={metalness} />
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
        ctx.fillStyle = "#0e1116";
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(245,246,248,0.85)";
        ctx.font = "500 22px ui-monospace, monospace";
        ctx.textBaseline = "top";
        const startY = h / 2 - (CODE_SNIPPET.length * 30) / 2;
        CODE_SNIPPET.forEach((line, i) => {
          ctx.fillText(line, w * 0.22, startY + i * 30);
        });
      }}
    />
  );
}

function BadgeBall({ radius }: Readonly<{ radius: number }>) {
  return (
    <CanvasTextureBall
      radius={radius}
      deps={[]}
      // Matte, not glossy — a specular hotspot from the Lightformer rig sits
      // roughly front-center on every sphere, which is exactly where this
      // one's text is, so cut roughness/metalness to keep it legible.
      roughness={0.9}
      metalness={0}
      draw={(ctx, w, h) => {
        ctx.fillStyle = "#3a6dc5";
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 6;
        ctx.strokeStyle = "rgba(14,17,22,0.35)";
        ctx.fillStyle = "#ffffff";
        ctx.font = "700 64px system-ui, sans-serif";
        ctx.strokeText("MGM", w / 2, h / 2 - 18);
        ctx.fillText("MGM", w / 2, h / 2 - 18);
        ctx.font = "600 22px ui-monospace, monospace";
        ctx.lineWidth = 3;
        ctx.strokeText("LABORATORY", w / 2, h / 2 + 40);
        ctx.fillText("LABORATORY", w / 2, h / 2 + 40);
      }}
    />
  );
}

function CycleBall({ radius, active }: Readonly<{ radius: number; active: boolean }>) {
  const labels = useMemo(() => WEBSITE_FOCUS_STACK.map((c) => c.title.toUpperCase()), []);
  const indexRef = useRef(0);
  const meshRef = useRef<THREE.Mesh>(null);
  const size = 512;
  const [texture] = useState(() => {
    const t = new THREE.CanvasTexture(makeCanvas(size, size));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });

  const paint = (label: string) => {
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#0e1116";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f5f6f8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 44px system-ui, sans-serif";
    ctx.fillText(label, size / 2, size / 2);
    // A CanvasTexture's own redraw flag — three.js's normal mutable-object
    // idiom, not React state; see lanyard.tsx's identical suppression.
    // eslint-disable-next-line react-hooks/immutability
    texture.needsUpdate = true;
  };

  useLayoutEffect(() => {
    paint(labels[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/immutability -- paint() redraws the CanvasTexture in place, see above
  useEffect(() => {
    if (!active || labels.length < 2) return undefined;
    const id = window.setInterval(() => {
      indexRef.current = (indexRef.current + 1) % labels.length;
      const mesh = meshRef.current;
      if (mesh) {
        gsap.fromTo(
          mesh.material as THREE.MeshStandardMaterial,
          { opacity: 0.25 },
          { opacity: 1, duration: 0.35, ease: "power1.out" },
        );
      }
      paint(labels[indexRef.current] ?? "");
    }, 1600);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, labels]);

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[radius, 48, 48]} />
      <meshStandardMaterial map={texture} roughness={0.55} metalness={0.1} transparent />
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
            {s.kind === "code" && <CodeBall radius={l.radius} />}
            {s.kind === "badge" && <BadgeBall radius={l.radius} />}
            {s.kind === "cycle" && <CycleBall radius={l.radius} active={play && !reduced} />}
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
      <ambientLight intensity={0.9} />
      {/* A wider, softer Lightformer rig than a single key light — chrome
          needs coverage from several directions or it reads as near-black
          with a couple of blown-out hotspots instead of a smooth gradient. */}
      <Environment blur={0.7} resolution={256}>
        <Lightformer intensity={3} color="white" position={[4, 4, 6]} scale={[8, 8, 1]} />
        <Lightformer intensity={2} color="white" position={[-5, -1, 4]} scale={[8, 8, 1]} />
        <Lightformer intensity={2} color="white" position={[0, -5, 5]} scale={[10, 4, 1]} />
        <Lightformer intensity={1.5} color="#3a6dc5" position={[-4, 5, -2]} scale={[10, 10, 1]} />
        <Lightformer intensity={1.5} color="white" position={[5, 0, -4]} scale={[10, 10, 1]} />
      </Environment>
      <SceneBody sectionEl={sectionEl} play={play} reduced={reducedMotion} dark={dark} />
    </Canvas>
  );
}
