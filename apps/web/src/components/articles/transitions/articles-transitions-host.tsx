"use client";

/**
 * Hosts the transitions that play inside the library world: list to
 * article ("open"), article to list ("close") and article to article
 * ("swap"). Mounted by app/articles/layout.tsx after the world host, so it
 * lives exactly as long as the world does.
 *
 * Renders nothing yet: the controller lands with the transitions work.
 */
export function ArticlesTransitionsHost() {
  return null;
}
