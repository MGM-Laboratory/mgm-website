"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formDesignSchema } from "@repo/shared";

import { FormShell } from "./form-shell";
import { StatusCard } from "./status-screens";

const DESIGN = formDesignSchema.parse({ background: { scene: "orbit", intensity: "calm" } });

/** A form link that leads nowhere: a missing tile in the lab's composition. */
export function FormNotFound() {
  return (
    <FormShell slug="not-found" design={DESIGN} stage="status">
      <div className="fx-center">
        <StatusCard glyph="missing" eyebrow="404" title="This form isn't here">
          <p className="fx-status-body">
            The link may be mistyped, or the form was taken down. Check the address with whoever
            shared it.
          </p>
          <div>
            <Link href="/" className="fx-button" data-variant="ghost">
              <ArrowLeft aria-hidden strokeWidth={2.25} size={18} />
              MGM Laboratory home
            </Link>
          </div>
        </StatusCard>
      </div>
    </FormShell>
  );
}
