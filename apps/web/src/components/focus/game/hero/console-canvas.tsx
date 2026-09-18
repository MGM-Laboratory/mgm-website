"use client";

import { useLayoutEffect, useRef } from "react";
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

type PieceKind = "controller" | "headset" | "joystick" | "chevron";

type PieceDef = {
  id: string;
  kind: PieceKind;
  color: string;
  final: [number, number, number];
  finalRot: [number, number, number];
  scale: number;
};

// Stylized, Bauhaus-abstracted from three.js primitives — no skeuomorphic
// detail, the same geometric-shape vocabulary DESIGN_SYSTEM.md already uses
// for the brand's flat motifs, just extruded into 3D.
const PIECES: PieceDef[] = [
  {
    id: "chevron-main",
    kind: "chevron",
    color: GREEN,
    final: [1.4, 0.4, -0.5],
    finalRot: [0.1, 0.5, 0],
    scale: 1.15,
  },
  {
    id: "controller",
    kind: "controller",
    color: BLUE,
    final: [-1.15, 0.5, 0.35],
    finalRot: [0.15, 0.5, -0.1],
    scale: 1,
  },
  {
    id: "headset",
    kind: "headset",
    color: RED,
    final: [-0.3, -0.9, 0.6],
    finalRot: [0, -0.4, 0],
    scale: 0.85,
  },
  {
    id: "joystick",
    kind: "joystick",
    color: YELLOW,
    final: [1.5, -0.75, 0.2],
    finalRot: [0, 0.3, 0],
    scale: 0.8,
  },
  {
    id: "chevron-small",
    kind: "chevron",
    color: GREEN,
    final: [0.5, 1.2, -0.65],
    finalRot: [0, 0.2, 0.6],
    scale: 0.5,
  },
];

function Piece({ def, groupRef }: { def: PieceDef; groupRef: (el: THREE.Group | null) => void }) {
  let content: React.ReactNode;

  if (def.kind === "chevron") {
    // Two thin boxes meeting at a bottom apex — the same "two crossed
    // boxes" technique as the website hero's plus piece, angled into a "^"
    // instead of a "+" so it reads as the chevron motif in 3D.
    content = (
      <group>
        <mesh position={[0.21, 0.21, 0]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.6, 0.16, 0.16]} />
          <meshStandardMaterial color={def.color} roughness={0.6} />
        </mesh>
        <mesh position={[-0.21, 0.21, 0]} rotation={[0, 0, -Math.PI / 4]}>
          <boxGeometry args={[0.6, 0.16, 0.16]} />
          <meshStandardMaterial color={def.color} roughness={0.6} />
        </mesh>
      </group>
    );
  } else if (def.kind === "controller") {
    content = (
      <group>
        <mesh>
          <boxGeometry args={[1.1, 0.42, 0.26]} />
          <meshStandardMaterial color={def.color} roughness={0.55} />
        </mesh>
        <mesh position={[-0.55, -0.1, 0]}>
          <sphereGeometry args={[0.24, 24, 24]} />
          <meshStandardMaterial color={def.color} roughness={0.55} />
        </mesh>
        <mesh position={[0.55, -0.1, 0]}>
          <sphereGeometry args={[0.24, 24, 24]} />
          <meshStandardMaterial color={def.color} roughness={0.55} />
        </mesh>
        {[-0.18, 0, 0.18].map((x) => (
          <mesh key={x} position={[x, 0.1, 0.14]}>
            <sphereGeometry args={[0.055, 16, 16]} />
            <meshStandardMaterial color="#ffffff" roughness={0.4} />
          </mesh>
        ))}
      </group>
    );
  } else if (def.kind === "headset") {
    content = (
      <group>
        <mesh>
          <boxGeometry args={[0.62, 0.38, 0.3]} />
          <meshStandardMaterial color={def.color} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0, -0.28]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.42, 0.08, 16, 40, Math.PI]} />
          <meshStandardMaterial color={def.color} roughness={0.6} />
        </mesh>
        <mesh position={[0.2, 0.05, 0.16]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color="#ffffff" roughness={0.4} />
        </mesh>
        <mesh position={[-0.2, 0.05, 0.16]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color="#ffffff" roughness={0.4} />
        </mesh>
      </group>
    );
  } else {
    content = (
      <group>
        <mesh position={[0, -0.24, 0]}>
          <cylinderGeometry args={[0.32, 0.36, 0.14, 28]} />
          <meshStandardMaterial color={def.color} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.5, 14]} />
          <meshStandardMaterial color={def.color} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.32, 0]}>
          <sphereGeometry args={[0.13, 20, 20]} />
          <meshStandardMaterial color={def.color} roughness={0.5} />
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

    const tl = gsap.timeline({ delay: 0.15, defaults: { ease: "back.out(1.7)" } });
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
      .to(cluster.rotation, { y: 0.7, duration: 1 }, 0);

    return () => {
      tl.kill();
    };
  }, [sectionEl, reduced]);

  useFrame((state, delta) => {
    const cluster = clusterRef.current;
    if (!cluster || reduced) return;
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

export type GameHeroCanvasProps = {
  sectionEl: HTMLElement | null;
  reducedMotion: boolean;
};

export default function GameHeroCanvas({ sectionEl, reducedMotion }: GameHeroCanvasProps) {
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
