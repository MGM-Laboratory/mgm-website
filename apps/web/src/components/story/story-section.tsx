import "./story.css";

import { StoryHost } from "@/components/story/story-host";
import { StoryShell } from "@/components/story/story-shell";
import { Storybook } from "@/components/story/storybook/storybook";

/**
 * The homepage story: `<section id="story">` after Featured Projects
 * (docs/homepage-story.md). Its server HTML carries both versions, and the
 * boot script picks one before the first paint: the storybook (the default,
 * and what no-JS visitors, crawlers and CI see) or the WebGL shell. The
 * host (client) then starts the engine, which draws into the layer host,
 * an empty element React never renders into.
 */
export function StorySection() {
  return (
    <section id="story" data-story-section className="story-section">
      <div data-story-layer-host />
      <Storybook />
      <StoryShell />
      <StoryHost />
    </section>
  );
}
