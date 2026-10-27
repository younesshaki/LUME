"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordInAppPath } from "./inAppHistory";

/**
 * Records each public page the visitor lands on into same-origin in-app
 * history, so the concierge's `navigate-back` resolves locally. Renders
 * nothing. Mounted once in the root layout; it reads `window.location.search`
 * directly (rather than `useSearchParams`) to avoid forcing a Suspense
 * boundary on every page.
 */
export default function NavHistoryRecorder() {
  const pathname = usePathname();
  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    recordInAppPath(`${pathname}${search}`);
  }, [pathname]);
  return null;
}
