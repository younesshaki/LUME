"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <LoginShell
      onSubmit={handleSubmit}
      email={email}
      password={password}
      error={error}
      pending={pending}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
    />
  );
}

function LoginShell({
  onSubmit,
  email = "",
  password = "",
  error,
  pending = false,
  onEmailChange,
  onPasswordChange,
}: {
  onSubmit?: (e: FormEvent) => void;
  email?: string;
  password?: string;
  error?: string | null;
  pending?: boolean;
  onEmailChange?: (value: string) => void;
  onPasswordChange?: (value: string) => void;
}) {
  return (
    <main className="min-h-screen grid place-items-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 bg-white dark:bg-neutral-950"
      >
        <h1 className="text-xl font-semibold">Sign in to LUME Admin</h1>
        <label className="block text-sm">
          <span className="text-neutral-600 dark:text-neutral-400">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => onEmailChange?.(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600 dark:text-neutral-400">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => onPasswordChange?.(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending || !onSubmit}
          className="w-full rounded-md bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 text-white px-3 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
