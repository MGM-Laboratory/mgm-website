import { ExtrudeGeometry, Group, Shape, type ShaderMaterial } from "three";

import { BAY, NEAR_Z, SPRING_Y } from "@/components/articles/world/library/layout";
import { instancedParts, type Part } from "@/components/articles/world/library/materials";

/**
 * The arcade over the nave: a pointed (equilateral) transverse arch on every
 * pier, with a recessed inner order, so the nave recedes as nested lancets
 * toward the window. Modelled for a nominal span and stretched across the
 * real one (a narrow phone nave gets tall lancets, a 21:9 one broad arches).
 */

/** Nominal inner half span (between the attached shafts), library units. */
const NOMINAL = 6.0;
/** Where the shafts stand inside the wall's face (see stacks.ts). */
const SHAFT = 0.28;
const SPRING = SPRING_Y + 0.42;

function pointedArch(a: number, t: number, depth: number) {
  const R = 2 * a + t;
  const r = 2 * a;
  const shape = new Shape();
  shape.moveTo(-(a + t), -0.3);
  shape.lineTo(-(a + t), 0);
  shape.absarc(a, 0, R, Math.PI, Math.acos(-a / R), true);
  shape.absarc(-a, 0, R, Math.acos(a / R), 0, true);
  shape.lineTo(a + t, -0.3);
  shape.lineTo(a, -0.3);
  shape.lineTo(a, 0);
  shape.absarc(-a, 0, r, 0, Math.PI / 3, false);
  shape.absarc(a, 0, r, (2 * Math.PI) / 3, Math.PI, false);
  shape.lineTo(-a, -0.3);
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 40,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

export type Vault = {
  group: Group;
  setNaveHalf(half: number): void;
  dispose(): void;
};

export function createVault(material: ShaderMaterial, options: { bays: number }): Vault {
  const outer = pointedArch(NOMINAL, 0.78, 0.8);
  const inner = pointedArch(NOMINAL - 0.34, 0.34, 0.5);
  const arches: Part[] = [];
  const orders: Part[] = [];
  for (let j = 0; j <= options.bays; j++) {
    const z = NEAR_Z - j * BAY;
    arches.push({ p: [0, SPRING, z], s: [1, 1, 1], light: "#F6F3EE", dark: "#10131C" });
    orders.push({ p: [0, SPRING, z - 0.45], s: [1, 1, 1], light: "#EEEAE2", dark: "#0C0E15" });
  }
  const group = new Group();
  const archMesh = instancedParts(arches, outer, material);
  const orderMesh = instancedParts(orders, inner, material);
  group.add(archMesh, orderMesh);
  return {
    group,
    setNaveHalf(half) {
      group.scale.x = Math.max(0.2, (half - SHAFT) / NOMINAL);
    },
    dispose() {
      outer.dispose();
      inner.dispose();
      archMesh.dispose();
      orderMesh.dispose();
    },
  };
}

/** The arches' inner apex (library units): they only stretch across, never up. */
export const VAULT_APEX = SPRING + NOMINAL * Math.sqrt(3);
