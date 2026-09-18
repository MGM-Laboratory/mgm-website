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

const RED = "#f94141";
const BLUE = "#3a6dc5";
const GREEN = "#0f8657";
const YELLOW = "#f7bf33";

type ScreenKind = "chat" | "apps" | "status";

// A small canvas-drawn phone screen — status bar, then content abstracted
// into blocks (chat bubbles / an app grid / a status dial), never a real
// screenshot. Same "browser card" technique as the /website hero, just
// tall/phone-proportioned instead of landscape.
function drawPhoneTexture(kind: ScreenKind, accent: string): THREE.CanvasTexture {
  const w = 340;
  const h = 700;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  // Status bar
  ctx.fillStyle = "#e4e4e1";
  ctx.fillRect(w / 2 - 44, 14, 88, 10);
  ctx.fillStyle = "#c9c9c4";
  ctx.fillRect(w - 60, 34, 34, 8);

  const top = 64;
  const pad = 22;

  if (kind === "apps") {
    const cols = 4;
    const gap = 16;
    const cell = (w - pad * 2 - gap * (cols - 1)) / cols;
    for (let i = 0; i < 16; i++) {
      const cx = pad + (i % cols) * (cell + gap);
      const cy = top + Math.floor(i / cols) * (cell + gap);
      ctx.fillStyle = i === 5 ? accent : "#e4e4e1";
      const r = 12;
      ctx.beginPath();
      ctx.roundRect(cx, cy, cell, cell, r);
      ctx.fill();
    }
  } else if (kind === "chat") {
    let y = top;
    const bubbles = [
      { w: 0.55, right: false },
      { w: 0.4, right: true },
      { w: 0.65, right: false },
      { w: 0.3, right: true },
      { w: 0.5, right: false },
      { w: 0.45, right: true },
    ];
    bubbles.forEach((b, i) => {
      const bw = (w - pad * 2) * b.w;
      const bx = b.right ? w - pad - bw : pad;
      ctx.fillStyle = b.right ? accent : "#e4e4e1";
      ctx.beginPath();
      ctx.roundRect(bx, y, bw, 34, 14);
      ctx.fill();
      y += 34 + (i % 2 === 0 ? 18 : 30);
    });
  } else {
    // status: a big dial + a row of stat blocks
    const cx = w / 2;
    const cy = top + 120;
    ctx.strokeStyle = "#e4e4e1";
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.arc(cx, cy, 90, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.beginPath();
    ctx.arc(cx, cy, 90, -Math.PI / 2, Math.PI * 0.9);
    ctx.stroke();

    const statTop = top + 250;
    for (let i = 0; i < 3; i++) {
      const bx = pad + i * ((w - pad * 2) / 3 + 4);
      ctx.fillStyle = i === 1 ? accent : "#e4e4e1";
      ctx.beginPath();
      ctx.roundRect(bx, statTop, (w - pad * 2) / 3 - 10, 70, 10);
      ctx.fill();
    }
  }

  // Home indicator
  ctx.fillStyle = "#d8d8d2";
  ctx.beginPath();
  ctx.roundRect(w / 2 - 50, h - 24, 100, 5, 3);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

type PieceKind = "phone" | "bracket";

type PieceDef = {
  id: string;
  kind: PieceKind;
  color: string;
  final: [number, number, number];
  finalRot: [number, number, number];
  scale: number;
  screenKind?: ScreenKind;
};

const PIECES: PieceDef[] = [
  {
    id: "phone-chat",
    kind: "phone",
    color: RED,
    final: [-1.05, 0.5, 0.3],
    finalRot: [0, 0.35, 0.04],
    scale: 1,
    screenKind: "chat",
  },
  {
    id: "phone-apps",
    kind: "phone",
    color: BLUE,
    final: [0.95, 0.35, 0.15],
    finalRot: [0, -0.4, -0.03],
    scale: 0.85,
    screenKind: "apps",
  },
  {
    id: "phone-status",
    kind: "phone",
    color: GREEN,
    final: [0.1, -0.95, 0.5],
    finalRot: [-0.05, 0.15, 0.02],
    scale: 0.62,
    screenKind: "status",
  },
  {
    id: "bracket-a",
    kind: "bracket",
    color: YELLOW,
    final: [1.55, -0.35, -0.5],
    finalRot: [0, 0, 0],
    scale: 0.55,
  },
  {
    id: "bracket-b",
    kind: "bracket",
    color: RED,
    final: [-1.6, -0.55, -0.35],
    finalRot: [0, 0, Math.PI],
    scale: 0.42,
  },
];

function Piece({ def, groupRef }: { def: PieceDef; groupRef: (el: THREE.Group | null) => void }) {
  const texture = useMemo(
    () =>
      def.kind === "phone" && def.screenKind ? drawPhoneTexture(def.screenKind, def.color) : null,
    [def.kind, def.screenKind, def.color],
  );
  useEffect(() => () => texture?.dispose(), [texture]);

  let content: React.ReactNode;
  if (def.kind === "phone") {
    content = (
      <group>
        {/* Accent bezel behind the white screen, same framing trick as the
            /website browser cards. */}
        <mesh position={[0, 0, -0.02]}>
          <planeGeometry args={[0.78, 1.5]} />
          <meshStandardMaterial color={def.color} roughness={0.7} />
        </mesh>
        <mesh>
          <planeGeometry args={[0.68, 1.4]} />
          <meshStandardMaterial
            map={texture ?? undefined}
            roughness={0.85}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    );
  } else {
    // Bracket — two beams meeting at a corner (an "L"), the same two-box
    // technique the /website cluster uses for its plus motif, just joined
    // at one end instead of crossed through the center.
    content = (
      <group>
        <mesh position={[-0.2, 0, 0]}>
          <boxGeometry args={[0.14, 0.9, 0.14]} />
          <meshStandardMaterial color={def.color} roughness={0.6} />
        </mesh>
        <mesh position={[0.15, -0.4, 0]}>
          <boxGeometry args={[0.66, 0.14, 0.14]} />
          <meshStandardMaterial color={def.color} roughness={0.6} />
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

  useLayoutEffect(() => {
    if (!sectionEl || reduced) return;
    const cluster = clusterRef.current;
    if (!cluster) return;

    const tl = gsap.timeline({
      scrollTrigger: { trigger: sectionEl, start: "top top", end: "+=60%", scrub: true },
    });
    tl.to(cluster.position, { y: 1.6, duration: 1 }, 0)
      .to(cluster.scale, { x: 0.6, y: 0.6, z: 0.6, duration: 1 }, 0)
      .to(cluster.rotation, { y: -0.7, duration: 1 }, 0);

    return () => {
      tl.kill();
    };
  }, [sectionEl, reduced]);

  useFrame((state, delta) => {
    const cluster = clusterRef.current;
    if (!cluster || reduced) return;
    cluster.rotation.y -= delta * 0.08;
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

export type MobileHeroCanvasProps = {
  sectionEl: HTMLElement | null;
  reducedMotion: boolean;
};

export default function MobileHeroCanvas({ sectionEl, reducedMotion }: MobileHeroCanvasProps) {
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
