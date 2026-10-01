import { Quaternion, Vector3, type Object3D, type Scene } from "three";

import type { Godette } from "@/components/story/props/godette";
import { createMagicTrail, type MagicTrail } from "@/components/story/props/fx/magic-trail";

import { headingQuaternion, type FlightPose } from "./common";

/**
 * Drives Godette through Act 3. She is shared (the table act had her
 * before, the finale takes her at f-cut) and every one of her setters
 * persists between frames, so on each frame the act is active this sets all
 * of them, from one `FlightPose`: the scene she is in, her root and pivot,
 * the body layers, face, look, glow and flight sway. When the act is not
 * active it touches nothing, so the next act finds her as it left her and
 * owns her from its first frame.
 *
 * `update(dt)` is called here once per active frame, after the pose is set,
 * so she never steps twice in one frame. Acts that hand her over follow the
 * same rule: only the act that owns the beat updates her.
 */
export class FlightDriver {
  readonly trail: MagicTrail;
  private readonly quaternion = new Quaternion();
  private readonly turn = new Quaternion();
  private readonly axis = new Vector3();
  private trailScene: Scene | null = null;

  constructor(readonly godette: Godette) {
    this.trail = createMagicTrail({ points: 48, width: 0.16, life: 0.9, intensity: 1 });
    this.trail.mesh.frustumCulled = false;
    this.trail.mesh.renderOrder = 5;
  }

  /** Puts her in `scene` (her only parent), posed for this frame, and steps her by `dt`. */
  apply(scene: Scene, pose: FlightPose, dt: number) {
    const g = this.godette;
    const root = g.root;
    if (root.parent !== scene) scene.add(root);
    root.visible = pose.visible;
    root.scale.setScalar(1);
    g.scale = 1;
    root.position.copy(pose.position);
    if (pose.up) headingQuaternion(pose.heading, this.quaternion, pose.up);
    else headingQuaternion(pose.heading, this.quaternion);
    if (pose.yaw !== 0) {
      this.turn.setFromAxisAngle(this.axis.set(0, 1, 0), pose.yaw);
      this.quaternion.multiply(this.turn);
    }
    if (pose.roll !== 0) {
      this.turn.setFromAxisAngle(this.axis.set(0, 0, 1), pose.roll);
      this.quaternion.multiply(this.turn);
    }
    root.quaternion.copy(this.quaternion);
    g.pivot.rotation.set(pose.pitch, pose.spin, 0, "XYZ");

    g.setContext("flight");
    g.setLook({
      toy: 0,
      rim: pose.rim,
      rimColor: pose.rimColor,
      lift: pose.lift,
      glowColor: pose.glowColor,
    });
    g.setNervous(pose.nervous);
    g.setBreath(1);
    g.setShadow(null);
    g.setAutoIdle(null);
    g.setBlinkRate(1);
    g.setBody(pose.layers.length > 0 ? pose.layers : [{ clip: "fly_glide", weight: 1 }]);
    g.setFace(pose.face, pose.faceWeight);
    g.lookAt(pose.look, pose.lookWeight);
    g.setGlow(pose.glow);
    g.setFlight({
      velocity: pose.velocity,
      bank: pose.bank,
      pitch: pose.lean,
      amount: pose.sway,
    });
    root.updateMatrixWorld(true);
    g.update(dt);
  }

  /** The trail lives in the scene she flies in. */
  trailIn(scene: Scene) {
    if (this.trailScene === scene) return;
    this.trailScene = scene;
    scene.add(this.trail.mesh);
  }

  /** Hides what this act added around her (the trail), never her. */
  sleep() {
    this.trail.setIntensity(0);
    this.trail.mesh.removeFromParent();
    this.trailScene = null;
  }

  /** Her root for raycasts and projections. */
  get object(): Object3D {
    return this.godette.root;
  }

  dispose() {
    this.trail.mesh.removeFromParent();
    this.trail.dispose();
  }
}
