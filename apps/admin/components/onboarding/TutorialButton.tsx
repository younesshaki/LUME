"use client";

import { GraduationCap } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { WEBSITE_TOUR_START_EVENT, websiteTourHref } from "../../lib/websiteTour";

/**
 * Starts the Website tutorial on demand. On the Website Hub it restarts the
 * tour in place; anywhere else it opens the Hub with the tour starting.
 */
export function TutorialButton({
  tenantSlug,
  label = "Tutorial",
  className,
}: {
  tenantSlug: string;
  label?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const onHub = pathname === `/admin/${tenantSlug}/website`;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className ?? "gap-2 text-muted-foreground"}
      aria-label="Start the Website tutorial"
      onClick={() => {
        if (onHub) window.dispatchEvent(new Event(WEBSITE_TOUR_START_EVENT));
        else router.push(websiteTourHref(tenantSlug));
      }}
    >
      <GraduationCap className="size-3.5" aria-hidden="true" />
      <span className="hidden md:inline">{label}</span>
    </Button>
  );
}
