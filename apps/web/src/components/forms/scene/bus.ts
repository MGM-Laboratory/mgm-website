/**
 * Moments the scene reacts to without re-rendering React: a question got
 * focus (a gentle pulse), validation failed (a small shudder), a piece
 * landed (a tick), the ending (the celebration).
 */
export type SceneSignal =
  | { type: "focus"; fieldId: string }
  | { type: "blur" }
  | { type: "error" }
  | { type: "land" }
  | { type: "celebrate" };

export class SceneBus {
  private listeners = new Set<(signal: SceneSignal) => void>();

  emit(signal: SceneSignal) {
    for (const listener of [...this.listeners]) listener(signal);
  }

  on(listener: (signal: SceneSignal) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
