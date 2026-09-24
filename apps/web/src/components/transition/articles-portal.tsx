"use client";

/**
 * The portal between the rest of the site and the articles library: the
 * transition any other page plays into /articles (and /articles/<slug>),
 * and the one the library plays back out to the real world. Mounted in the
 * root layout next to the project zoom, because it has to outlive both
 * sides of the navigation.
 *
 * Renders nothing yet: the portal lands with the transitions work. It must
 * stay render-nothing until a navigation needs it (it ships on every page,
 * including the Lighthouse-audited ones), and it must never pull three.js
 * into the root chunk.
 */
export function ArticlesPortal() {
  return null;
}
