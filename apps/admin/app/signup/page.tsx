"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { isValidInviteToken, signupNextPath } from "@/lib/signupDestination";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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

/**
 * Self-serve signup. Two flavors:
 *
 * - Plain /signup: the site name is stashed in user_metadata so
 *   /admin/onboarding can provision the tenant even when email confirmation
 *   forces a round trip before the first authenticated session exists.
 * - /signup?invite=<token>: the visitor is joining an EXISTING site, so no
 *   site name is collected, no metadata is stashed, and after the account
 *   exists they return to /invite/<token> instead of auto-provisioning.
 */
export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const rawInvite = params.get("invite");
  const inviteToken = isValidInviteToken(rawInvite) ? rawInvite : null;
  const nextPath = signupNextPath(rawInvite);

  const [siteName, setSiteName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: inviteToken ? {} : { site_name: siteName.trim() } },
    });
    setPending(false);
    if (error) {
      setError(error.message);
      return;
    }

    if (data.session) {
      router.push(nextPath);
      router.refresh();
      return;
    }
    // Email confirmation is enabled — no session until the link is clicked.
    setConfirmSent(true);
  }

  if (confirmSent) {
    return (
      <main className="grid min-h-screen place-items-center bg-muted/40 px-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              We sent a confirmation link to <strong>{email}</strong>. After confirming,
              sign in and{" "}
              {inviteToken
                ? "you'll be taken back to your invite."
                : "your site will be created automatically."}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" asChild className="w-full">
              <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>Go to sign in</Link>
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-muted/40 px-6">
      <Card className="w-full max-w-sm">
        <form onSubmit={handleSubmit}>
          <CardHeader className="pb-4">
            <p className="mb-2 text-sm font-semibold tracking-[0.2em] text-primary">LUME</p>
            <CardTitle>{inviteToken ? "Create your account" : "Create your LUME site"}</CardTitle>
            <CardDescription>
              {inviteToken
                ? "You've been invited to join a team. Create an account with the email the invite was sent to."
                : "One account, one website — live in your admin in seconds."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!inviteToken && (
              <div className="space-y-2">
                <Label htmlFor="siteName">Business / site name</Label>
                <Input
                  id="siteName"
                  type="text"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  required
                  maxLength={80}
                  placeholder="Acme Motors"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="flex-col gap-3 pt-2">
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Creating account..." : "Create account"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link
                href={inviteToken ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
