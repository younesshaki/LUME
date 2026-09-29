/**
 * Demo-only usernames for the three isolated showcase tenants. These map a
 * short sign-in name to an existing, verified Supabase Auth email and the
 * tenant dashboard that member may access. They are not authorization: the
 * existing Supabase password check and tenant-membership checks remain the
 * source of truth.
 */
const DEMO_ACCOUNTS = {
  sean: {
    email: "sean@demo.lume.app",
    destination: "/admin/demo-sean",
  },
  arash: {
    email: "arash@demo.lume.app",
    destination: "/admin/demo-arash",
  },
  max: {
    email: "max@demo.lume.app",
    destination: "/admin/demo-max",
  },
} as const;

export type DemoAccessAccount = (typeof DEMO_ACCOUNTS)[keyof typeof DEMO_ACCOUNTS];

export function demoAccessAccount(username: string): DemoAccessAccount | null {
  const normalized = username.trim().toLowerCase();
  return DEMO_ACCOUNTS[normalized as keyof typeof DEMO_ACCOUNTS] ?? null;
}
