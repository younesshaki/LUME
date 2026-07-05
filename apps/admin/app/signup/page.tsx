"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Self-serve signup. The site name is stashed in user_metadata so the
 * onboarding step can provision the tenant even when email confirmation
 * forces a round trip before the first authenticated session exists.
 */
export default function SignupPage() {
  const router = useRouter();
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
      options: { data: { site_name: siteName.trim() } },
    });
    setPending(false);
    if (error) {
      setError(error.message);
      return;
    }

    if (data.session) {
      router.push("/admin/onboarding");
      router.refresh();
      return;
    }
    // Email confirmation is enabled — no session until the link is clicked.
    setConfirmSent(true);
  }

  if (confirmSent) {
    return (
      <main className="min-h-screen grid place-items-center px-6">
        <div className="w-full max-w-sm space-y-3 rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 bg-white dark:bg-neutral-950">
          <h1 className="text-xl font-semibold">Check your email</h1>
          <p className="text-sm text-neutral-500">
            We sent a confirmation link to <strong>{email}</strong>. After
            confirming, sign in and your site will be created automatically.
          </p>
          <Link href="/login?next=/admin/onboarding" className="text-sm underline underline-offset-2">
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid place-items-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 bg-white dark:bg-neutral-950"
      >
        <div>
          <h1 className="text-xl font-semibold">Create your LUME site</h1>
          <p className="text-sm text-neutral-500 mt-1">
            One account, one website — live in your admin in seconds.
          </p>
        </div>
        <label className="block text-sm">
          <span className="text-neutral-600 dark:text-neutral-400">Business / site name</span>
          <input
            type="text"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            required
            maxLength={80}
            placeholder="Acme Motors"
            className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600 dark:text-neutral-400">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600 dark:text-neutral-400">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 text-white px-3 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Creating account..." : "Create account"}
        </button>
        <p className="text-xs text-neutral-500">
          Already have an account?{" "}
          <Link href="/login" className="underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
