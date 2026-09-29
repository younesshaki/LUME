"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { adminSectionFromPath, type AdminAnalyticsIdentity } from "../../lib/adminAnalytics";

type Properties = Record<string, boolean | number | string | null | undefined>;

const SESSION_STARTED_KEY = "lume.admin.analytics.session-started.v1";
const LAST_DISTINCT_ID_KEY = "lume.admin.analytics.distinct-id.v1";

let active = false;

/**
 * Safe event wrapper for dashboard components. A no-op unless the tracker is
 * running for a demo account; analytics may never affect the dashboard.
 */
export function captureAdminEvent(name: string, properties: Properties = {}): void {
  if (!active) return;
  try {
    posthog.capture(
      name,
      Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined)),
    );
  } catch {
    // Third-party analytics is intentionally non-blocking.
  }
}

/**
 * PostHog for the admin dashboard, mounted by the admin layout only for demo
 * dealership accounts (see adminAnalyticsIdentity). Records the session
 * (replay), every route (pageview + admin_section_viewed), clicks
 * (autocapture) and named dashboard events, all under the member's user id.
 */
export function AdminAnalytics({
  token,
  host,
  identity,
  release,
}: {
  token: string;
  host: string;
  identity: AdminAnalyticsIdentity;
  release: string;
}) {
  const pathname = usePathname();

  useEffect(() => {
    if (active) return;
    try {
      posthog.init(token, {
        api_host: host,
        autocapture: true,
        capture_pageview: "history_change",
        capture_pageleave: true,
        person_profiles: "identified_only",
        disable_session_recording: false,
        session_recording: {
          // Matches the public site's internal-phase setting; PostHog still
          // always masks password fields.
          maskAllInputs: false,
        },
      });
      // A different person signed in on this browser: start a fresh identity
      // instead of merging two accounts' histories.
      const previous = readStorage(LAST_DISTINCT_ID_KEY);
      if (previous && previous !== identity.distinctId) posthog.reset();
      posthog.identify(identity.distinctId, identity.personProperties, {
        first_dashboard_visit_at: new Date().toISOString(),
      });
      writeStorage(LAST_DISTINCT_ID_KEY, identity.distinctId);
      posthog.register({ lume_surface: "admin", lume_account: identity.account, lume_release: release });
      active = true;

      if (!readSession(SESSION_STARTED_KEY)) {
        writeSession(SESSION_STARTED_KEY, "1");
        captureAdminEvent("admin_session_started", {
          account: identity.account,
          landing_path: window.location.pathname,
        });
      }
    } catch {
      // Never let analytics break the dashboard.
    }
  }, [host, identity, release, token]);

  useEffect(() => {
    if (!active || !pathname) return;
    const { tenant, section } = adminSectionFromPath(pathname);
    try {
      posthog.register({ lume_tenant_slug: tenant ?? undefined });
    } catch {
      // Non-blocking.
    }
    captureAdminEvent("admin_section_viewed", { tenant_slug: tenant, section, path: pathname });
  }, [pathname]);

  return null;
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable.
  }
}
function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Storage unavailable.
  }
}
