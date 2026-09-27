/** Renderers that are really a CPU: a 3D mark would crawl there, so those visitors get the flat one. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

let probed: boolean | null = null;

/**
 * Whether this browser has a hardware WebGL2 context (three@0.186 is
 * WebGL2-only). A major performance caveat fails it outright, and so does a
 * renderer string naming a software rasteriser: SwiftShader passes the
 * caveat check, and it is what headless Chromium and CI use. Same probe as
 * the articles world (articles/world/world-host.tsx).
 */
export function hardwareWebGL2() {
  if (probed !== null) return probed;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!gl) {
      probed = false;
      return probed;
    }
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    probed = !SOFTWARE_RENDERER.test(renderer);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    probed = false;
  }
  return probed;
}
