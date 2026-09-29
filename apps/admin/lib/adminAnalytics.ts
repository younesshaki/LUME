/**
 * Admin-dashboard product analytics (PostHog), for the demo dealership
 * accounts only. Pure helpers shared by the server layout (who is tracked, and
 * with which browser token) and the client tracker (identity and events).
 *
 * Identity: each tracked person's PostHog distinct id is their Supabase auth
 * user id, which never changes and is unique. Person properties add a human
 * handle (`lume_account`, e.g. "demo-sean") so recordings are easy to find.
 */

/** Demo dealership workspaces whose members' dashboard sessions are recorded. */
export const ADMIN_ANALYTICS_TENANT_SLUGS: readonly string[] = ["demo-arash", "demo-max", "demo-sean"];

export type AdminAnalyticsMembership = { slug: string; name: string; role: string };

export type AdminAnalyticsIdentity = {
  distinctId: string;
  /** The demo workspace this person belongs to, e.g. "demo-sean". */
  account: string;
  personProperties: Record<string, string | string[]>;
};

/**
 * Who the dashboard tracker follows. Null (nothing loads) unless the signed-in
 * member belongs to a demo workspace; LUME platform admins are never tracked,
 * so internal testing does not mix into the dealers' data.
 */
export function adminAnalyticsIdentity(input: {
  userId: string;
  email: string | null;
  isPlatformAdmin: boolean;
  memberships: readonly AdminAnalyticsMembership[];
}): AdminAnalyticsIdentity | null {
  if (input.isPlatformAdmin || !input.userId) return null;
  const demo = input.memberships.filter((membership) => ADMIN_ANALYTICS_TENANT_SLUGS.includes(membership.slug));
  if (demo.length === 0) return null;
  const primary = [...demo].sort((a, b) => a.slug.localeCompare(b.slug))[0];
  return {
    distinctId: input.userId,
    account: primary.slug,
    personProperties: {
      lume_account: primary.slug,
      lume_dealership: primary.name,
      lume_role: primary.role,
      lume_tenants: demo.map((membership) => membership.slug),
      ...(input.email ? { email: input.email } : {}),
    },
  };
}

/**
 * The browser token for PostHog. Only a project token (`phc_…`) is publishable
 * by design — the public site ships the same kind of token — so anything else
 * (e.g. a `phx_` personal API key) is refused and the tracker stays off.
 */
export function publishablePostHogToken(token: string | undefined | null): string | null {
  const trimmed = token?.trim() ?? "";
  return /^phc_[A-Za-z0-9]+$/.test(trimmed) ? trimmed : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The dashboard area a path belongs to, for `admin_section_viewed`:
 * `/admin/demo-sean/website/pages/<uuid>` → { tenant: "demo-sean",
 * section: "website/pages/:id" }. Ids are collapsed so sections aggregate.
 */
export function adminSectionFromPath(pathname: string): { tenant: string | null; section: string } {
  const parts = pathname.split("?")[0].split("/").filter(Boolean);
  if (parts[0] !== "admin") return { tenant: null, section: parts.join("/") || "home" };
  if (parts.length === 1) return { tenant: null, section: "admin" };
  if (parts[1] === "platform" || parts[1] === "onboarding") return { tenant: null, section: parts.slice(1).join("/") };
  const rest = parts.slice(2).map((part) => (UUID.test(part) ? ":id" : part));
  return { tenant: parts[1], section: rest.length ? rest.join("/") : "overview" };
}
