// ogl@1.0.11 exports `Triangle` from its JS entrypoint (src/index.js) but the
// published type barrel (types/index.d.ts) never re-exports it — a real gap
// in the package's own types, not something wrong in this project. This
// module augmentation adds the missing declaration back. The top-level
// import is what makes TS treat the `declare module` block below as an
// augmentation of the real "ogl" module rather than a fresh, isolated
// ambient declaration that would shadow every other type ogl exports.
import type { Geometry } from "ogl";

declare module "ogl" {
  export class Triangle extends Geometry {}
}
