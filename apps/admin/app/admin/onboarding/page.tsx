/**
 * First-run onboarding: provisions the signed-in user's tenant (site).
 *
 * Reached from /signup (or any session without memberships). Provisioning
 * runs in a server action with the service client — provisionTenant is a
 * no-op returning the existing tenant if the user already owns one, so
 * double submits and email-confirm round trips are safe.
 */
import { redirect } from "next/navigation";
import { DEFAULT_PAGES } from "@lume/blocks";
import { createServiceClient } from "@lume/db/server";
import { provisionTenant } from "@lume/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/onboarding");

  // Already a member somewhere? Straight to the dashboard.
  const { data: memberships } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1);
  if (memberships && memberships.length > 0) redirect("/admin");

  const suggestedName =
    typeof user.user_metadata?.site_name === "string" && user.user_metadata.site_name.trim()
      ? user.user_metadata.site_name.trim()
      : "";

  async function createSite(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login?next=/admin/onboarding");

    const name = String(formData.get("siteName") ?? "").trim();
    if (!name) redirect("/admin/onboarding");

    const service = createServiceClient();
    const result = await provisionTenant(service, {
      ownerUserId: user.id,
      name,
      pages: DEFAULT_PAGES.map((page) => ({
        slug: page.slug,
        title: page.title,
        navOrder: page.navOrder,
        isReserved: page.isReserved,
        seoMeta: page.seoMeta as Record<string, unknown>,
        blocks: page.blocks,
      })),
    });

    redirect(`/admin/${result.slug}`);
  }

  return (
    <main className="min-h-screen grid place-items-center px-6">
      <form
        action={createSite}
        className="w-full max-w-sm space-y-4 rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 bg-white dark:bg-neutral-950"
      >
        <div>
          <h1 className="text-xl font-semibold">Name your site</h1>
          <p className="text-sm text-neutral-500 mt-1">
            We&apos;ll set up your website, pages, inventory and AI concierge —
            you can customize everything afterwards.
          </p>
        </div>
        <label className="block text-sm">
          <span className="text-neutral-600 dark:text-neutral-400">Business / site name</span>
          <input
            type="text"
            name="siteName"
            defaultValue={suggestedName}
            required
            maxLength={80}
            placeholder="Acme Motors"
            className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-md bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 text-white px-3 py-2 text-sm font-medium"
        >
          Create my site
        </button>
      </form>
    </main>
  );
}
