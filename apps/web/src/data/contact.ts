import { DEFAULT_CONTACT_SETTINGS } from "@repo/shared";

// The footer (site-wide, rendered inside the animation-heavy nav/header
// tree) intentionally stays pinned to this static default rather than
// fetching the CMS-configurable value the /contact page uses — deriving
// from the same default here just keeps the two from silently drifting
// apart until that's wired up as its own task.
export const HQ_ADDRESS_LINES = DEFAULT_CONTACT_SETTINGS.address.split("\n");
export const HQ_COORDS = { lat: DEFAULT_CONTACT_SETTINGS.lat, lng: DEFAULT_CONTACT_SETTINGS.lng };
