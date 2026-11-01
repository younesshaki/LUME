"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { recordInAppPath } from "./inAppHistory";
import { watchTargetActivation } from "./targetActivation";

/**
 * Records each public page the visitor lands on into same-origin in-app
 * history, so the concierge's `navigate-back` resolves locally. Renders
 * nothing. Search-only transitions matter as much as route changes. The root
 * layout isolates this observer in Suspense so static pages remain renderable.
 */
export default function NavHistoryRecorder() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    recordInAppPath(`${pathname}${search ? `?${search}` : ""}`);
    return watchTargetActivation();
  }, [pathname, search]);
  return null;
}
