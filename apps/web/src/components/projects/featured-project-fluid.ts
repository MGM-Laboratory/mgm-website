/** A small, pointer-driven image ripple for the featured cards on the homepage. */
export function startFeaturedProjectFluid(
  frame: HTMLElement,
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return () => {};

  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  let raf = 0;
  let width = 0;
  let height = 0;
  let x = 0;
  let y = 0;
  let previousX = 0;
  let previousY = 0;
  let lastMove = 0;
  let strength = 0;
  let inside = false;

  const resize = () => {
    const rect = frame.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    if (width <= 0 || height <= 0) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  };

  const draw = (now: number) => {
    raf = 0;
    if (
      !inside ||
      preference.matches ||
      !finePointer.matches ||
      !image.complete ||
      !image.naturalWidth
    ) {
      canvas.style.opacity = "0";
      return;
    }
    const age = now - lastMove;
    if (age > 850) {
      canvas.style.opacity = "0";
      return;
    }

    const fade = Math.pow(1 - age / 850, 2);
    const radius = Math.min(190, Math.max(115, width * 0.3));
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    const sourceX = (image.naturalWidth - sourceWidth) / 2;
    const sourceY = (image.naturalHeight - sourceHeight) / 2;
    const cell = 12;

    context.clearRect(0, 0, width, height);
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
    for (
      let top = Math.max(0, Math.floor((y - radius) / cell) * cell);
      top < Math.min(height, y + radius);
      top += cell
    ) {
      for (
        let left = Math.max(0, Math.floor((x - radius) / cell) * cell);
        left < Math.min(width, x + radius);
        left += cell
      ) {
        const centerX = left + cell / 2;
        const centerY = top + cell / 2;
        const dx = centerX - x;
        const dy = centerY - y;
        const distance = Math.hypot(dx, dy);
        if (distance > radius || distance < 1) continue;
        const falloff = Math.pow(1 - distance / radius, 2);
        const wave = Math.sin(distance * 0.065 - age * 0.024);
        const displacement = wave * strength * falloff * fade;
        const tileWidth = Math.min(cell + 0.5, width - left);
        const tileHeight = Math.min(cell + 0.5, height - top);
        context.drawImage(
          image,
          sourceX + left / scale,
          sourceY + top / scale,
          tileWidth / scale,
          tileHeight / scale,
          left + (dx / distance) * displacement,
          top + (dy / distance) * displacement,
          tileWidth,
          tileHeight,
        );
      }
    }
    canvas.style.opacity = "1";
    raf = window.requestAnimationFrame(draw);
  };

  const onMove = (event: PointerEvent) => {
    if (preference.matches || !finePointer.matches) return;
    const rect = frame.getBoundingClientRect();
    x = event.clientX - rect.left;
    y = event.clientY - rect.top;
    if (!inside) {
      previousX = x;
      previousY = y;
    }
    const travel = Math.hypot(x - previousX, y - previousY);
    previousX = x;
    previousY = y;
    strength = Math.min(22, Math.max(8, travel * 0.8));
    lastMove = performance.now();
    inside = true;
    if (!raf) raf = window.requestAnimationFrame(draw);
  };
  const onLeave = () => {
    inside = false;
    canvas.style.opacity = "0";
    window.cancelAnimationFrame(raf);
    raf = 0;
  };
  const onPreferenceChange = () => {
    if (preference.matches || !finePointer.matches) onLeave();
  };

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(frame);
  frame.addEventListener("pointermove", onMove, { passive: true });
  frame.addEventListener("pointerleave", onLeave);
  preference.addEventListener("change", onPreferenceChange);
  finePointer.addEventListener("change", onPreferenceChange);
  return () => {
    onLeave();
    observer.disconnect();
    frame.removeEventListener("pointermove", onMove);
    frame.removeEventListener("pointerleave", onLeave);
    preference.removeEventListener("change", onPreferenceChange);
    finePointer.removeEventListener("change", onPreferenceChange);
  };
}
