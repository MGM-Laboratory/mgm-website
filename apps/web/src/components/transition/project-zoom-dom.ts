import { toCss } from "@/components/transition/project-zoom-colors";
import {
  FIELD_OF_VIEW,
  FOG_SOFTNESS,
  type Rect,
  type View,
  type ZoomFrame,
  type ZoomRenderer,
  type ZoomSetup,
} from "@/components/transition/project-zoom-frame";

// A uniform CSS blur standing in for the radial streak (the fallback has
// no per-pixel shading), as a share of the streak length.
const BLUR_PER_STREAK = 0.1;

/**
 * The project zoom without WebGL2: a fixed clone of the cover (a rounded
 * box holding the picture over the theme colour) moved with the same
 * frames as the WebGL quad. Transforms carry the travel, the growth and
 * the 3D swing; the picture's own transform carries the zoom; a CSS blur
 * follows the zoom speed; and a radial mask on the picture dissolves it
 * into the theme colour from the rim inward. No chromatic split and no
 * barrel distortion here.
 */
export class ZoomDom implements ZoomRenderer {
  private readonly box: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly picture: HTMLImageElement;
  private base: Rect = { x: 0, y: 0, width: 1, height: 1 };
  private view: View = { width: 1, height: 1 };

  constructor(host: HTMLElement) {
    this.box = document.createElement("div");
    this.fill = document.createElement("div");
    this.picture = document.createElement("img");
    this.picture.alt = "";
    this.picture.decoding = "sync";
    Object.assign(this.box.style, {
      position: "absolute",
      left: "0",
      top: "0",
      overflow: "hidden",
      visibility: "hidden",
      transformOrigin: "50% 50%",
    });
    Object.assign(this.fill.style, { position: "absolute", inset: "0" });
    Object.assign(this.picture.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      transformOrigin: "50% 50%",
    });
    this.box.append(this.fill, this.picture);
    host.appendChild(this.box);
  }

  begin({ view, source, picture, fog, backdrop }: ZoomSetup) {
    this.view = view;
    this.base = { ...source.rect };
    Object.assign(this.box.style, {
      left: `${source.rect.x}px`,
      top: `${source.rect.y}px`,
      width: `${source.rect.width}px`,
      height: `${source.rect.height}px`,
      borderRadius: `${source.radius}px`,
      backgroundColor: toCss(backdrop),
      willChange: "transform",
      visibility: "visible",
    });
    this.fill.style.backgroundColor = toCss(fog);
    const url = picture.url ?? picture.element?.currentSrc ?? picture.element?.src ?? null;
    if (url) {
      this.picture.src = url;
      this.picture.style.display = "";
    } else {
      this.picture.removeAttribute("src");
      this.picture.style.display = "none";
    }
  }

  /**
   * Resolves once the clone's picture can paint (or can't load at all).
   * Shown any earlier, the clone would flash its theme colour fill where
   * the card's picture was.
   */
  ready(): Promise<void> {
    const picture = this.picture;
    if (picture.style.display === "none" || !picture.getAttribute("src")) {
      return Promise.resolve();
    }
    return picture.decode().catch(() => undefined);
  }

  resize(view: View) {
    this.view = view;
  }

  draw(frame: ZoomFrame) {
    const { base } = this;
    const scale = frame.width / base.width;
    const distance = this.view.height / 2 / Math.tan(FIELD_OF_VIEW / 2);
    const dx = frame.cx - (base.x + base.width / 2);
    const dy = frame.cy - (base.y + base.height / 2);
    this.box.style.transform =
      `translate3d(${dx}px, ${dy}px, 0) perspective(${distance}px) ` +
      `rotateY(${frame.yaw}rad) rotateZ(${frame.roll}rad) scale(${scale})`;
    // The box's radius scales with it; keep the frame's own proportions.
    this.box.style.borderRadius = `${frame.radius / scale}px`;
    this.box.style.opacity = String(frame.alpha);

    this.picture.style.transform = `scale(${frame.zoom})`;
    const blur = frame.streak * BLUR_PER_STREAK;
    this.picture.style.filter = blur >= 0.3 ? `blur(${blur.toFixed(2)}px)` : "";

    // The dissolve: clear inside the front's soft edge, the theme colour
    // (the fill behind the picture) past it. The mask sits on the zoomed
    // picture, so its radii are in the picture's own pixels: undo both the
    // box's scale and the picture's zoom, or the front runs out too far.
    const outer = (frame.fog * frame.reach) / (scale * frame.zoom);
    const inner = ((frame.fog - FOG_SOFTNESS) * frame.reach) / (scale * frame.zoom);
    const mask =
      outer <= 0
        ? "linear-gradient(transparent, transparent)"
        : `radial-gradient(circle at 50% 50%, #000 ${Math.max(0, inner).toFixed(1)}px, transparent ${outer.toFixed(1)}px)`;
    this.picture.style.setProperty("mask-image", mask);
    this.picture.style.setProperty("-webkit-mask-image", mask);
  }

  end() {
    Object.assign(this.box.style, { visibility: "hidden", transform: "", willChange: "" });
    this.picture.style.removeProperty("mask-image");
    this.picture.style.removeProperty("-webkit-mask-image");
    this.picture.style.filter = "";
    this.picture.style.transform = "";
  }
}
