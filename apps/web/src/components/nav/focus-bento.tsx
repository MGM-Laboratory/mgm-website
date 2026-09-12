import type { NavBentoLink } from "@/data/nav";

import { WorkBento } from "./work-bento";

// Focus uses the same slide-reveal card component as Our Work while keeping
// its four focus areas in a balanced 2×2 layout.
export function FocusBento({
  items,
  registerRef,
  onNavigate,
}: {
  items: NavBentoLink[];
  registerRef: (index: number, el: HTMLAnchorElement | null) => void;
  onNavigate: () => void;
}) {
  return (
    <WorkBento
      items={items}
      registerRef={registerRef}
      onNavigate={onNavigate}
      featuredFirst={false}
      actionLabel="Explore"
    />
  );
}
