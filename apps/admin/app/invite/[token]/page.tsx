/**
 * Invite redemption page. Lives outside /admin because the invitee is not a
 * tenant member yet (the admin layout assumes memberships exist).
 *
 * Reads use the service client (invitee can't pass tenant_invites RLS by
 * design); the invitee's authenticated session + validateInviteForUser are
 * the gate. The membership write happens in a server action, never on GET.
 */
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@lume/db/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateInviteForUser, type RedeemableInvite } from "@/lib/inviteAccept";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PageProps = { params: Promise<{ token: string }> };

async function loadInvite(token: string) {
  const service = createServiceClient();
  const { data: invite } = await service
    .from("tenant_invites")
    .select("id, tenant_id, email, role, status, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!invite) return null;

  const { data: tenant } = await service
    .from("tenants")
    .select("id, slug, name")
    .eq("id", invite.tenant_id)
    .maybeSingle();
  if (!tenant) return null;

  return { invite: invite as RedeemableInvite, tenant };
}

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold tracking-tight">You&apos;ve been invited</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with the email address the invite was sent to, and you&apos;ll be
          brought back here to accept it.
        </p>
        <Button asChild className="w-full">
          <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
            Sign in to continue
          </Link>
        </Button>
      </Shell>
    );
  }

  const loaded = await loadInvite(token);
  if (!loaded) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold tracking-tight">Invite not found</h1>
        <p className="text-sm text-muted-foreground">
          This invite link is invalid. Ask a team admin to send a new one.
        </p>
      </Shell>
    );
  }

  const { invite, tenant } = loaded;
  const problem = validateInviteForUser(invite, user.email);
  if (problem) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold tracking-tight">Can&apos;t accept this invite</h1>
        <p className="text-sm text-muted-foreground">{problem}</p>
      </Shell>
    );
  }

  async function acceptInvite() {
    "use server";

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

    // Re-fetch + re-validate inside the action — the page render is stale by
    // the time the button is clicked.
    const loaded = await loadInvite(token);
    if (!loaded) redirect(`/invite/${token}`);
    const problem = validateInviteForUser(loaded.invite, user.email);
    if (problem) redirect(`/invite/${token}`);

    const service = createServiceClient();
    // ignoreDuplicates: an existing membership keeps its (possibly higher) role.
    const { error: memberErr } = await service
      .from("tenant_members")
      .upsert(
        { tenant_id: loaded.invite.tenant_id, user_id: user.id, role: loaded.invite.role },
        { onConflict: "tenant_id,user_id", ignoreDuplicates: true }
      );
    if (memberErr) throw new Error(`Failed to join team: ${memberErr.message}`);

    const { error: inviteErr } = await service
      .from("tenant_invites")
      .update({ status: "accepted" })
      .eq("id", loaded.invite.id)
      .eq("status", "pending");
    if (inviteErr) throw new Error(`Failed to mark invite accepted: ${inviteErr.message}`);

    revalidatePath("/admin", "layout");
    redirect(`/admin/${loaded.tenant.slug}`);
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold tracking-tight">Join {tenant.name}</h1>
      <p className="text-sm text-muted-foreground">
        You&apos;ve been invited to <strong>{tenant.name}</strong> as{" "}
        <strong>{invite.role}</strong> ({user.email}).
      </p>
      <form action={acceptInvite}>
        <Button type="submit" className="w-full">
          Accept invite
        </Button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/40 px-6">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 pt-6">{children}</CardContent>
      </Card>
    </main>
  );
}
