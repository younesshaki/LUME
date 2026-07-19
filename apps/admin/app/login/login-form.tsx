"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

export function LoginForm() {
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

export function LoginShell({
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
    <Card className="w-full max-w-sm">
      <form onSubmit={onSubmit}>
        <CardHeader className="pb-4">
          <CardTitle>Sign in to LUME Admin</CardTitle>
          <CardDescription>Manage your site, inventory, and AI concierge.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => onEmailChange?.(e.target.value)}
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
              onChange={(e) => onPasswordChange?.(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="flex-col gap-3 pt-2">
          <Button type="submit" disabled={pending || !onSubmit} className="w-full">
            {pending ? "Signing in..." : "Sign in"}
          </Button>
          <p className="text-xs text-muted-foreground">
            New to LUME?{" "}
            <a href="/signup" className="underline underline-offset-2 hover:text-foreground">
              Create your site
            </a>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
