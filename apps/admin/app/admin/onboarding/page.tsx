/**
 * First-run onboarding: provisions the signed-in user's tenant (site).
 *
 * Reached from /signup (or any session without memberships). Provisioning
 * runs in a server action with the service client — provisionTenant is a
 * no-op returning the existing tenant if the user already owns one, so
 * double submits and email-confirm round trips are safe.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DEFAULT_PAGES } from "@lume/blocks";
import { createServiceClient } from "@lume/db/server";
import { provisionTenant } from "@lume/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

    // The sidebar layout is cached with the pre-signup (tenant-less) state;
    // without this the new tenant is invisible until the cache expires.
    revalidatePath("/admin", "layout");
    redirect(`/admin/${result.slug}`);
  }

  return (
    <main className="grid min-h-[60vh] place-items-center px-6">
      <Card className="w-full max-w-sm">
        <form action={createSite}>
          <CardHeader className="pb-4">
            <p className="mb-2 text-sm font-semibold tracking-[0.2em] text-primary">LUME</p>
            <CardTitle>Name your site</CardTitle>
            <CardDescription>
              We&apos;ll set up your website, pages, inventory and AI concierge — you can
              customize everything afterwards.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="siteName">Business / site name</Label>
              <Input
                id="siteName"
                type="text"
                name="siteName"
                defaultValue={suggestedName}
                required
                maxLength={80}
                placeholder="Acme Motors"
              />
            </div>
          </CardContent>
          <CardFooter className="pt-2">
            <Button type="submit" className="w-full">
              Create my site
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
