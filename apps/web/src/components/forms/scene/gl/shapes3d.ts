import * as THREE from "three";

import type { ShapeKind } from "../vocabulary";

/**
 * The brand's shapes as three.js outlines, in the same 100-unit box as the
 * SVG vocabulary (centred on the origin, y up), extruded into cut cards
 * (orbit, constellation, paper) or deep blocks (blocks).
 */

function star4(shape: THREE.Shape | THREE.Path, r: number) {
  // The fan: four arcs pulled in toward the corners.
  shape.moveTo(0, r);
  shape.absarc(r, r, r, Math.PI, Math.PI * 1.5, false);
  shape.absarc(r, -r, r, Math.PI / 2, Math.PI, false);
  shape.absarc(-r, -r, r, 0, Math.PI / 2, false);
  shape.absarc(-r, r, r, Math.PI * 1.5, Math.PI * 2, false);
}

function polygon(points: [number, number][]) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => (index ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  return shape;
}

const PLUS: [number, number][] = [
  [-12, 44],
  [12, 44],
  [12, 12],
  [44, 12],
  [44, -12],
  [12, -12],
  [12, -44],
  [-12, -44],
  [-12, -12],
  [-44, -12],
  [-44, 12],
  [-12, 12],
];

export function shapeOutline(kind: ShapeKind): THREE.Shape[] {
  switch (kind) {
    case "circle": {
      const shape = new THREE.Shape();
      shape.absarc(0, 0, 47, 0, Math.PI * 2, false);
      return [shape];
    }
    case "ring": {
      const shape = new THREE.Shape();
      shape.absarc(0, 0, 46, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, 25, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      return [shape];
    }
    case "half": {
      const shape = new THREE.Shape();
      shape.moveTo(-47, -22);
      shape.absarc(0, -22, 47, Math.PI, 0, true);
      shape.lineTo(-47, -22);
      return [shape];
    }
    case "quarter": {
      const shape = new THREE.Shape();
      shape.moveTo(-46, -46);
      shape.lineTo(-46, 46);
      shape.absarc(-46, -46, 92, Math.PI / 2, 0, true);
      shape.lineTo(-46, -46);
      return [shape];
    }
    case "triangle":
      return [
        polygon([
          [-46, 46],
          [-46, -46],
          [46, -46],
        ]),
      ];
    case "square":
      return [
        polygon([
          [-44, -44],
          [44, -44],
          [44, 44],
          [-44, 44],
        ]),
      ];
    case "plus":
      return [polygon(PLUS)];
    case "x": {
      const cos = Math.SQRT1_2;
      return [
        polygon(
          PLUS.map(([x, y]) => [(x - y) * cos * 1.05, (x + y) * cos * 1.05] as [number, number]),
        ),
      ];
    }
    case "leaf": {
      const shape = new THREE.Shape();
      shape.moveTo(-46, -46);
      shape.bezierCurveTo(-46, 8, -8, 46, 46, 46);
      shape.bezierCurveTo(46, -8, 8, -46, -46, -46);
      return [shape];
    }
    case "domes": {
      const top = new THREE.Shape();
      top.moveTo(46, 46);
      top.absarc(0, 46, 46, 0, Math.PI, true);
      top.lineTo(46, 46);
      const bottom = new THREE.Shape();
      bottom.moveTo(-46, -46);
      bottom.absarc(0, -46, 46, Math.PI, 0, true);
      bottom.lineTo(-46, -46);
      return [top, bottom];
    }
    case "fan": {
      const shape = new THREE.Shape();
      star4(shape, 47);
      return [shape];
    }
    default:
      return [polygon(PLUS)];
  }
}

export function pieceGeometry(kind: ShapeKind, depth: number) {
  const geometry = new THREE.ExtrudeGeometry(shapeOutline(kind), {
    depth,
    bevelEnabled: true,
    bevelThickness: Math.min(3, depth * 0.2),
    bevelSize: 2.2,
    bevelSegments: 2,
    curveSegments: 20,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/** A paper plane, nose along +x, about 100 units long. */
export function planeGeometry() {
  const geometry = new THREE.BufferGeometry();
  // Two wings and a keel, folded from one sheet.
  const nose = [50, 0, 0];
  const tailLeft = [-50, 0, 34];
  const tailRight = [-50, 0, -34];
  const keelTop = [-50, 6, 0];
  const keelBottom = [-44, -16, 0];
  const vertices = new Float32Array([
    ...nose,
    ...tailLeft,
    ...keelTop,
    ...nose,
    ...keelTop,
    ...tailRight,
    ...nose,
    ...keelBottom,
    ...keelTop,
  ]);
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}
