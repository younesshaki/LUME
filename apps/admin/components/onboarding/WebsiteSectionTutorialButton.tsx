import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Button } from "../ui/button";
import {
  websiteSectionTourHref,
  type WebsiteSectionTourKey,
} from "../../lib/websiteSectionTour";

/** A route-local replay entry point; it never mutates the current route state. */
export function WebsiteSectionTutorialButton({
  tenantSlug,
  tourKey,
}: {
  tenantSlug: string;
  tourKey: WebsiteSectionTourKey;
}) {
  return (
    <Button asChild type="button" variant="outline" size="sm" className="gap-2 text-muted-foreground">
      <Link href={websiteSectionTourHref(tenantSlug, tourKey)} aria-label={`Start the ${tourKey} tutorial`}>
        <GraduationCap className="size-3.5" aria-hidden="true" />
        <span className="hidden md:inline">Tutorial</span>
      </Link>
    </Button>
  );
}
