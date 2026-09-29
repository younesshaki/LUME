"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { demoAccessAccount } from "../../lib/demoAccess";

const INVALID_CREDENTIALS = "Invalid username or password.";

export function DemoAccessForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const account = demoAccessAccount(username);
    if (!account) {
      setError(INVALID_CREDENTIALS);
      return;
    }

    setPending(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: account.email,
      password,
    });
    setPending(false);

    if (signInError) {
      setError(INVALID_CREDENTIALS);
      return;
    }

    router.push(account.destination);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5" aria-label="Demo sign in">
      <div className="space-y-2">
        <Label htmlFor="demo-username">Username</Label>
        <Input
          id="demo-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoFocus
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="demo-password">Password</Label>
        <Input
          id="demo-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
