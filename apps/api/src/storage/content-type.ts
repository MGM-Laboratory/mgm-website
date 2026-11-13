// Types that a browser runs or renders as a page when it opens the file from a site address.
const ACTIVE_CONTENT_TYPE =
  /^(?:text\/(?:html|xml|javascript)|application\/(?:xhtml\+xml|xml|javascript)|image\/svg\+xml)$/i;

/** The type to store for a file from an anonymous caller. A page or a script is stored as plain bytes. */
export function storedContentType(contentType: string) {
  const type = contentType.split(";")[0].trim().toLowerCase();
  return !type || ACTIVE_CONTENT_TYPE.test(type) ? "application/octet-stream" : type;
}
