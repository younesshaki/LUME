import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminIndexPage() {
  const supabase = await createSupabaseServerClient();
  const { data: tenants } = await supabase.from("tenants").select("id, slug, name");

  // Fresh account with no tenant yet → first-run onboarding creates one.
  if (tenants?.length === 0) redirect("/admin/onboarding");

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Pick a tenant from the sidebar to manage its site, content, vehicles, and bot.
        </p>
      </header>

      {tenants?.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-sm text-neutral-500">
          You don&apos;t have access to any tenants yet. Ask an existing owner to
          add you, or seed a default tenant via the seed script
          (see <code>scripts/seed-default-tenant.ts</code>).
        </div>
      )}
    </div>
  );
}
