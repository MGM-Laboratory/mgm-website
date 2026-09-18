"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const BLUE = "#3a6dc5";
const YELLOW = "#f7bf33";
const RED = "#f94141";
const GREEN = "#0f8657";

type CardKind = "nav" | "list" | "grid";

// A small canvas-drawn "browser card" — chrome dots, then a wireframe
// content block in the piece's own accent color. Deliberately abstract
// (blocks, not real screenshots) so it reads as "a website" at a glance
// without needing photographic assets.
function drawCardTexture(kind: CardKind, accent: string): THREE.CanvasTexture {
  const w = 512;
  const h = 348;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#f1f1ef";
  ctx.fillRect(0, 0, w, 34);
  [RED, YELLOW, GREEN].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(22 + i * 22, 17, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  const pad = 28;
  const top = 34 + pad;
  ctx.fillStyle = "#e4e4e1";

  if (kind === "nav") {
    ctx.fillStyle = accent;
    ctx.fillRect(pad, top, w - pad * 2, 52);
    ctx.fillStyle = "#e4e4e1";
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(pad, top + 52 + 26 + i * 28, w - pad * 2 - i * 70, 14);
    }
  } else if (kind === "list") {
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 3 === 0 ? accent : "#e4e4e1";
      ctx.fillRect(pad, top + i * 36, w - pad * 2, 24);
    }
  } else {
    const cols = 3;
    const gap = 14;
    const cell = (w - pad * 2 - gap * (cols - 1)) / cols;
    for (let i = 0; i < 6; i++) {
      const cx = pad + (i % cols) * (cell + gap);
      const cy = top + Math.floor(i / cols) * (cell + gap);
      ctx.fillStyle = i === 0 ? accent : "#e4e4e1";
      ctx.fillRect(cx, cy, cell, cell);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

type PieceKind = "torus" | "card" | "plus" | "ring-small";

type PieceDef = {
  id: string;
  kind: PieceKind;
  color: string;
  final: [number, number, number];
  finalRot: [number, number, number];
  scale: number;
  cardKind?: CardKind;
};

const PIECES: PieceDef[] = [
  {
    id: "ring-main",
    kind: "torus",
    color: BLUE,
    final: [1.35, 0.35, -0.5],
    finalRot: [1.15, 0.3, 0],
    scale: 1,
  },
  {
    id: "card-nav",
    kind: "card",
    color: BLUE,
    final: [-1.15, 0.55, 0.35],
    finalRot: [0, 0.4, 0.04],
    scale: 1,
    cardKind: "nav",
  },
  {
    id: "card-list",
    kind: "card",
    color: GREEN,
    final: [-0.35, -0.95, 0.65],
    finalRot: [-0.08, -0.32, -0.03],
    scale: 0.78,
    cardKind: "list",
  },
  {
    id: "card-grid",
    kind: "card",
    color: RED,
    final: [1.5, -0.75, 0.2],
    finalRot: [0.05, -0.5, 0.02],
    scale: 0.72,
    cardKind: "grid",
  },
  {
    id: "plus-a",
    kind: "plus",
    color: YELLOW,
    final: [-1.65, -0.15, -0.25],
    finalRot: [0, 0, 0.1],
    scale: 0.5,
  },
  {
    id: "ring-small",
    kind: "ring-small",
    color: RED,
    final: [0.55, 1.15, -0.65],
    finalRot: [0.6, 0, 0],
    scale: 0.42,
  },
];

function Piece({ def, groupRef }: { def: PieceDef; groupRef: (el: THREE.Group | null) => void }) {
  const texture = useMemo(
    () => (def.kind === "card" && def.cardKind ? drawCardTexture(def.cardKind, def.color) : null),
    [def.kind, def.cardKind, def.color],
  );
  useEffect(() => () => texture?.dispose(), [texture]);

  let content: React.ReactNode;
  if (def.kind === "torus") {
    content = (
      <mesh>
        <torusGeometry args={[0.5, 0.15, 24, 64]} />
        <meshStandardMaterial color={def.color} roughness={0.55} metalness={0.1} />
      </mesh>
    );
  } else if (def.kind === "ring-small") {
    content = (
      <mesh>
        <torusGeometry args={[0.4, 0.13, 20, 48]} />
        <meshStandardMaterial color={def.color} roughness={0.55} metalness={0.1} />
      </mesh>
    );
  } else if (def.kind === "plus") {
    content = (
      <group>
        <mesh>
          <boxGeometry args={[0.9, 0.22, 0.14]} />
          <meshStandardMaterial color={def.color} roughness={0.6} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.9, 0.22, 0.14]} />
          <meshStandardMaterial color={def.color} roughness={0.6} />
        </mesh>
      </group>
    );
  } else {
    content = (
      <group>
        {/* A slightly larger accent plane behind the card reads as a thin
            colored border framing the white "screen" in front of it. */}
        <mesh position={[0, 0, -0.02]}>
          <planeGeometry args={[1.42, 1.02]} />
          <meshStandardMaterial color={def.color} roughness={0.7} />
        </mesh>
        <mesh>
          <planeGeometry args={[1.3, 0.9]} />
          <meshStandardMaterial
            map={texture ?? undefined}
            roughness={0.85}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={groupRef} scale={0}>
      {content}
    </group>
  );
}

function Scene({ sectionEl, reduced }: { sectionEl: HTMLElement | null; reduced: boolean }) {
  const clusterRef = useRef<THREE.Group>(null);
  const pieceRefs = useRef<Map<string, THREE.Group>>(new Map());
  const pointerTarget = useRef({ x: 0, y: 0 });
  const { viewport } = useThree();

  // Overall cluster shrinks to fit narrower canvases (mobile/tablet) without
  // needing a second hand-tuned layout — everything scales from one factor.
  const fit = Math.min(1, viewport.width / 5.2);

  useLayoutEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;

    if (reduced) {
      PIECES.forEach((def) => {
        const el = pieceRefs.current.get(def.id);
        if (!el) return;
        el.position.set(...def.final);
        el.rotation.set(...def.finalRot);
        el.scale.setScalar(def.scale);
      });
      return;
    }

    const tl = gsap.timeline({ delay: 0.5, defaults: { ease: "back.out(1.7)" } });
    PIECES.forEach((def, i) => {
      const el = pieceRefs.current.get(def.id);
      if (!el) return;
      const startAngle = (i / PIECES.length) * Math.PI * 2;
      const startRadius = 4.2;
      // Scattered starting pose — off in a wide ring around the final
      // cluster, so every piece visibly travels inward to assemble.
      el.position.set(Math.cos(startAngle) * startRadius, Math.sin(startAngle) * startRadius, -2);
      el.rotation.set(def.finalRot[0] + 1.4, def.finalRot[1] - 1.4, def.finalRot[2]);

      tl.to(
        el.position,
        { x: def.final[0], y: def.final[1], z: def.final[2], duration: 1.1 },
        i * 0.08,
      )
        .to(
          el.rotation,
          { x: def.finalRot[0], y: def.finalRot[1], z: def.finalRot[2], duration: 1.1 },
          i * 0.08,
        )
        .to(
          el.scale,
          { x: def.scale, y: def.scale, z: def.scale, duration: 0.9, ease: "back.out(2.4)" },
          i * 0.08,
        );
    });

    return () => {
      tl.kill();
    };
  }, [reduced]);

  // Scroll exit — the whole cluster drifts up, shrinks, and spins slightly
  // away as the hero section scrolls past, mirroring the DOM content's own
  // scroll-exit fade in website-hero.tsx.
  useLayoutEffect(() => {
    if (!sectionEl || reduced) return;
    const cluster = clusterRef.current;
    if (!cluster) return;

    const tl = gsap.timeline({
      scrollTrigger: { trigger: sectionEl, start: "top top", end: "+=60%", scrub: true },
    });
    tl.to(cluster.position, { y: 1.6, duration: 1 }, 0)
      .to(cluster.scale, { x: 0.6, y: 0.6, z: 0.6, duration: 1 }, 0)
      .to(cluster.rotation, { y: 0.7, duration: 1 }, 0);

    return () => {
      tl.kill();
    };
  }, [sectionEl, reduced]);

  useFrame((state, delta) => {
    const cluster = clusterRef.current;
    if (!cluster || reduced) return;
    // Idle drift — a slow perpetual spin plus gentle pointer-follow tilt.
    // Driven by R3F's own render loop (not GSAP): this canvas already runs
    // its own rAF for every frame regardless, same idiom as the Projects
    // morph shader's `uTime` uniform.
    cluster.rotation.y += delta * 0.08;
    pointerTarget.current.x = state.pointer.x;
    pointerTarget.current.y = state.pointer.y;
    cluster.rotation.x = THREE.MathUtils.damp(
      cluster.rotation.x,
      pointerTarget.current.y * -0.18,
      4,
      delta,
    );
    cluster.position.x = THREE.MathUtils.damp(
      cluster.position.x,
      pointerTarget.current.x * 0.25,
      4,
      delta,
    );
  });

  return (
    <group ref={clusterRef} scale={fit}>
      {PIECES.map((def) => (
        <Piece
          key={def.id}
          def={def}
          groupRef={(el) => {
            if (el) pieceRefs.current.set(def.id, el);
            else pieceRefs.current.delete(def.id);
          }}
        />
      ))}
    </group>
  );
}

export type WebsiteHeroCanvasProps = {
  sectionEl: HTMLElement | null;
  reducedMotion: boolean;
};

export default function WebsiteHeroCanvas({ sectionEl, reducedMotion }: WebsiteHeroCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 6.2], fov: 32 }}
      dpr={[1, 1.75]}
      gl={{ alpha: true }}
      onCreated={({ gl }) => gl.setClearColor(new THREE.Color(0x000000), 0)}
    >
      <ambientLight intensity={1.4} />
      <directionalLight position={[3, 4, 5]} intensity={1.2} />
      <Environment blur={0.8}>
        <Lightformer intensity={2} color="white" position={[0, 2, 4]} scale={[6, 3, 1]} />
        <Lightformer intensity={1.5} color="white" position={[-4, -2, 2]} scale={[4, 4, 1]} />
      </Environment>
      <Scene sectionEl={sectionEl} reduced={reducedMotion} />
    </Canvas>
  );
}
