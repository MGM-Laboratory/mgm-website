/** Renderers that are really a CPU: headless browsers, CI runners, remote desktops. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

let probed: boolean | null = null;

/**
 * Whether this browser has a hardware WebGL2 context. A major performance
 * caveat fails outright, and so does a renderer string that names a
 * software rasteriser (SwiftShader passes the caveat check: that is what
 * headless Chromium and CI use, and those get the DOM reel). Probed once
 * per page load; importing this module never pulls in three.js.
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
