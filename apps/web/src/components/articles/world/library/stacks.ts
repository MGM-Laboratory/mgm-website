import { BoxGeometry, Group, InstancedMesh, type ShaderMaterial } from "three";

import {
  BAY,
  FLOOR_Y,
  GALLERY_DEPTH,
  GALLERY_Y,
  NEAR_Z,
  SHELF_GAP,
  SPRING_Y,
} from "@/components/articles/world/library/layout";
import {
  instancedParts,
  mulberry32,
  type Part,
} from "@/components/articles/world/library/materials";
import { WORLD_PALETTE } from "@/components/articles/world/palette";

/**
 * The two walls of the nave: three storeys of stacks between stone piers,
 * two galleries running the whole length on slabs with balustrades, rolling
 * ladders leaning here and there, a cornice where the arches spring and a
 * plain upper wall above.
 *
 * One wall is modelled (inner face at local x = 0, the stacks going into
 * negative x, running from NEAR_Z down the nave) and drawn twice: the right
 * wall is the same instances turned half a turn about the vertical axis
 * and slid down the nave, so its near end is the left wall's far end (no
 * mirror twin shows across the margins) while the piers still line up.
 * Four draw calls for everything: books and stone, each side.
 */

const light = WORLD_PALETTE.light;
const dark = WORLD_PALETTE.dark;

const STONE = { light: "#F4F1EB", dark: "#0D1017" };
const SHELF = { light: "#EFEAE1", dark: "#0F121A" };
const PIER = { light: "#F7F4EF", dark: "#11141D" };
const RAIL = { light: "#F8F6F1", dark: "#141824" };
const WOOD = { light: "#E6DAC4", dark: "#1A1711" };
const BACK = { light: "#E7E3DA", dark: "#080A10" };

export type Stacks = {
  group: Group;
  /** Moves the walls to ±half (library units). */
  setNaveHalf(half: number): void;
  dispose(): void;
};

export function createStacks(
  material: ShaderMaterial,
  options: { bays: number; bookMin: number },
): Stacks {
  const rand = mulberry32(20260925);
  const rb = (a: number, b: number) => a + (b - a) * rand();
  const books: Part[] = [];
  const stone: Part[] = [];
  const bays = options.bays;
  const far = NEAR_Z - bays * BAY;
  const midZ = (NEAR_Z + far) / 2;

  const pickBook = () => {
    const index = Math.floor(rand() * light.books.length);
    return { light: light.books[index], dark: dark.books[index] };
  };

  const box = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    color: { light: string; dark: string },
    r?: readonly [number, number, number],
  ) => {
    stone.push({
      p: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      s: [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)],
      r,
      ...color,
    });
  };

  // ---------------------------------------------------------------- storeys
  const storeys: [number, number][] = [
    [FLOOR_Y + 0.35, GALLERY_Y[0] - 0.3],
    [GALLERY_Y[0], GALLERY_Y[1] - 0.3],
    [GALLERY_Y[1], SPRING_Y - 0.25],
  ];

  const shelfRow = (y: number, z0: number, z1: number, height: number) => {
    let z = z0 + 0.06;
    while (z < z1 - 0.06) {
      const w = rb(options.bookMin, options.bookMin + 0.17);
      if (z + w > z1 - 0.06) break;
      const gap = rand();
      if (gap < 0.035) {
        z += rb(0.2, 0.55);
        continue;
      }
      if (gap < 0.05) {
        // A short pile lying flat.
        const count = 2 + Math.floor(rand() * 3);
        let py = y;
        const depth = rb(0.6, 0.8);
        const span = rb(0.5, 0.75);
        for (let i = 0; i < count; i++) {
          const t = rb(0.08, 0.14);
          books.push({
            p: [-1.08 + depth / 2 + rb(0, 0.12), py, z + span / 2],
            s: [depth, t, span],
            r: [0, rb(-0.08, 0.08), 0],
            ...pickBook(),
          });
          py += t;
        }
        z += span + 0.05;
        continue;
      }
      const h = Math.min(height - 0.12, rb(0.78, 1.18));
      const d = rb(0.66, 0.92);
      const lean = rand() < 0.05 ? rb(-0.22, 0.22) : 0;
      books.push({
        p: [-1.08 + d / 2 + rb(0, 0.14), y, z + w / 2],
        s: [d, h, w],
        r: [lean, 0, 0],
        ...pickBook(),
      });
      z += w + (rand() < 0.25 ? rb(0.005, 0.04) : 0.004);
    }
  };

  for (let bay = 0; bay < bays; bay++) {
    const zNear = NEAR_Z - bay * BAY - 0.45;
    const zFar = NEAR_Z - (bay + 1) * BAY + 0.45;
    // Back of the case.
    box(-1.3, -1.08, FLOOR_Y, SPRING_Y, zFar, zNear, BACK);
    for (const [bottom, top] of storeys) {
      let y = bottom;
      while (y + SHELF_GAP * 0.72 < top) {
        box(-1.1, -0.02, y - 0.09, y, zFar, zNear, SHELF);
        const next = Math.min(y + SHELF_GAP, top);
        shelfRow(y, zFar, zNear, next - y - 0.1);
        y = next;
      }
      // The top board of the storey.
      box(-1.12, 0.02, top - 0.1, top, zFar, zNear, SHELF);
    }
    // A rolling ladder in some bays, leaning on the lower or middle stacks.
    if (rand() < 0.42) {
      const storey = rand() < 0.55 ? 0 : 1;
      const [bottom, top] = storeys[storey];
      const height = top - bottom + 0.1;
      const foot = storey === 0 ? 1.15 : 0.82;
      const angle = Math.atan2(foot, height);
      const zc = rb(zFar + 0.8, zNear - 0.8);
      const railLength = Math.hypot(foot, height);
      const cx = foot / 2;
      const cy = bottom + height / 2;
      for (const dz of [-0.26, 0.26]) {
        box(
          cx - 0.04,
          cx + 0.04,
          cy - railLength / 2,
          cy + railLength / 2,
          zc + dz - 0.04,
          zc + dz + 0.04,
          WOOD,
          [0, 0, angle],
        );
      }
      for (let t = 0.08; t < 0.97; t += 0.075) {
        const ry = bottom + height * t;
        const rx = foot * (1 - t);
        box(rx - 0.03, rx + 0.03, ry - 0.02, ry + 0.02, zc - 0.26, zc + 0.26, WOOD);
      }
    }
  }

  // ---------------------------------------------------------------- piers
  for (let j = 0; j <= bays; j++) {
    const z = NEAR_Z - j * BAY;
    // Slender piers, so a grazing view down the nave still sees the books.
    box(-1.35, 0.14, FLOOR_Y, SPRING_Y + 0.2, z - 0.4, z + 0.4, PIER);
    // Plinth and capital.
    box(-1.4, 0.3, FLOOR_Y, FLOOR_Y + 0.7, z - 0.5, z + 0.5, PIER);
    box(-1.4, 0.44, SPRING_Y - 0.1, SPRING_Y + 0.42, z - 0.55, z + 0.55, PIER);
    // The attached shaft the arch lands on.
    box(0.14, 0.34, FLOOR_Y + 0.7, SPRING_Y - 0.1, z - 0.12, z + 0.12, RAIL);
    // Corbels under the galleries.
    for (const g of GALLERY_Y) {
      box(0.3, GALLERY_DEPTH - 0.1, g - 0.95, g - 0.3, z - 0.22, z + 0.22, PIER);
    }
  }

  // ---------------------------------------------------------------- galleries
  for (const g of GALLERY_Y) {
    // The slab and its lip, the full length of the nave.
    box(-0.05, GALLERY_DEPTH, g - 0.3, g, far, NEAR_Z, STONE);
    box(GALLERY_DEPTH - 0.14, GALLERY_DEPTH + 0.04, g - 0.52, g + 0.04, far, NEAR_Z, PIER);
    // Balustrade: two rails and the balusters between them.
    const x = GALLERY_DEPTH - 0.09;
    box(x - 0.07, x + 0.07, g + 0.92, g + 1.04, far, NEAR_Z, RAIL);
    box(x - 0.05, x + 0.05, g + 0.08, g + 0.16, far, NEAR_Z, RAIL);
    for (let z = NEAR_Z - 0.2; z > far; z -= 0.34) {
      box(x - 0.035, x + 0.035, g + 0.16, g + 0.92, z - 0.035, z + 0.035, RAIL);
    }
  }

  // ---------------------------------------------------------------- upper wall
  box(-1.45, 0.4, SPRING_Y - 0.25, SPRING_Y + 0.3, far, NEAR_Z, PIER);
  box(-1.5, -0.2, SPRING_Y + 0.3, SPRING_Y + 14, far, NEAR_Z, STONE);

  const bookGeometry = new BoxGeometry(1, 1, 1);
  bookGeometry.translate(0, 0.5, 0);
  const stoneGeometry = new BoxGeometry(1, 1, 1);

  const group = new Group();
  const leftBooks = instancedParts(books, bookGeometry, material);
  const leftStone = instancedParts(stone, stoneGeometry, material);
  const twin = (source: InstancedMesh) => {
    const mesh = new InstancedMesh(source.geometry, material, source.count);
    mesh.instanceMatrix = source.instanceMatrix;
    mesh.count = source.count;
    mesh.frustumCulled = false;
    return mesh;
  };
  const rightBooks = twin(leftBooks);
  const rightStone = twin(leftStone);
  const left = new Group();
  const right = new Group();
  left.add(leftBooks, leftStone);
  right.add(rightBooks, rightStone);
  // Half a turn about the vertical: x and z flip. Slide it back down the
  // nave so it spans the same stretch of floor.
  right.rotation.y = Math.PI;
  right.position.z = 2 * midZ;
  group.add(left, right);

  return {
    group,
    setNaveHalf(half) {
      left.position.x = -half;
      right.position.x = half;
    },
    dispose() {
      bookGeometry.dispose();
      stoneGeometry.dispose();
      leftBooks.geometry.dispose();
      leftStone.geometry.dispose();
      leftBooks.dispose();
      leftStone.dispose();
    },
  };
}
