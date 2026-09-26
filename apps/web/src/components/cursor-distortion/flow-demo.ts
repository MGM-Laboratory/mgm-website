import { CanvasTexture, Mesh, MeshBasicMaterial, NoColorSpace, PlaneGeometry } from "three";

import type { GlHost } from "@/lib/gl-host";

/**
 * Development only (`?flowdemo`): a picture drawn INTO the flow stage, so
 * the cursor visibly smears it, the way the homepage reel's video will be.
 * It follows a DOM box every frame (the hero, else the first section),
 * which also proves layers stay glued to the content while it scrolls.
 * Never imported in production (flow-controller.ts gates it).
 */
export function mountFlowDemo(host: GlHost) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 400;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const colors = ["#3a6dc5", "#f7bf33", "#f94141", "#0f8657", "#0e1116"];
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 640, 400);
    for (let index = 0; index < 16; index += 1) {
      ctx.fillStyle = colors[index % colors.length];
      ctx.fillRect(index * 40, 0, 20, 400);
    }
    ctx.fillStyle = "#f7bf33";
    ctx.beginPath();
    ctx.arc(200, 200, 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f94141";
    ctx.fillRect(360, 90, 200, 200);
    ctx.fillStyle = "#0e1116";
    ctx.font = "bold 64px sans-serif";
    ctx.fillText("flow demo", 150, 370);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  const material = new MeshBasicMaterial({ map: texture });
  const mesh = new Mesh(new PlaneGeometry(1, 1), material);
  host.scene.add(mesh);

  const target = () =>
    document.querySelector<HTMLElement>(".hero") ??
    document.querySelector<HTMLElement>("#smooth-content section");

  const offFrame = host.onFrame(() => {
    const element = target();
    if (!element) {
      mesh.visible = false;
      return;
    }
    const rect = element.getBoundingClientRect();
    const width = Math.min(rect.width * 0.36, 560);
    const height = width * 0.625;
    const x = rect.left + rect.width * 0.62;
    const y = rect.top + rect.height * 0.5 - height / 2;
    mesh.visible = true;
    mesh.position.set(x + width / 2, -(y + height / 2), 0);
    mesh.scale.set(width, height, 1);
  });
  host.requestFrames("flow-demo", true);
  host.requestFrames("flow-demo", false);

  return () => {
    offFrame();
    host.scene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
    texture.dispose();
  };
}
