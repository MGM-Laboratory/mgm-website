import type { StoryPropMap, StoryProps } from "@/components/story/engine/act";

/**
 * The shared props registry (`StoryContext.props`): each key is built once,
 * by whichever act asks first, and every later caller gets the same
 * promise. Props with a `dispose()` are disposed with the stage.
 */
export class StoryPropsImpl implements StoryProps {
  private readonly builds = new Map<keyof StoryPropMap, Promise<unknown>>();
  private readonly built = new Map<keyof StoryPropMap, unknown>();

  ensure<K extends keyof StoryPropMap>(
    key: K,
    build: () => StoryPropMap[K] | Promise<StoryPropMap[K]>,
  ): Promise<StoryPropMap[K]> {
    const existing = this.builds.get(key);
    if (existing) return existing as Promise<StoryPropMap[K]>;
    const job = Promise.resolve()
      .then(build)
      .then((value) => {
        this.built.set(key, value);
        return value;
      });
    // A failed build may be tried again by the next caller.
    job.catch(() => {
      if (this.builds.get(key) === job) this.builds.delete(key);
    });
    this.builds.set(key, job);
    return job;
  }

  get<K extends keyof StoryPropMap>(key: K): StoryPropMap[K] | undefined {
    return this.built.get(key) as StoryPropMap[K] | undefined;
  }

  dispose() {
    for (const value of this.built.values()) {
      if (value && typeof value === "object" && "dispose" in value) {
        const dispose = (value as { dispose: unknown }).dispose;
        if (typeof dispose === "function") dispose.call(value);
      }
    }
    this.built.clear();
    this.builds.clear();
  }
}
