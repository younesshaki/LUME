"use client";

import { useState, useTransition } from "react";
import { Copy, KeyRound, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createApiKey, revokeApiKey } from "./actions";

export type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

const SCOPE_OPTIONS = [
  { value: "leads:write", label: "Submit leads" },
  { value: "vehicles:read", label: "Read vehicles" },
] as const;

export function ApiKeysClient({ slug, keys }: { slug: string; keys: ApiKeyRow[] }) {
  const [error, setError] = useState<string | null>(null);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function onCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createApiKey(slug, formData);
      if (result.error) setError(result.error);
      else if (result.rawKey) {
        setFreshKey(result.rawKey);
        setCopied(false);
      }
    });
  }

  function onRevoke(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await revokeApiKey(slug, id);
      if (result.error) setError(result.error);
    });
  }

  async function copyFreshKey() {
    if (!freshKey) return;
    try {
      await navigator.clipboard.writeText(freshKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-6">
      {freshKey && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-medium">
            Copy this key now — it will not be shown again.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-background px-2 py-1 font-mono text-xs break-all">
              {freshKey}
            </code>
            <Button variant="outline" size="sm" onClick={copyFreshKey}>
              <Copy className="size-3.5" />
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFreshKey(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <KeyRound className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Keys</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">
                  No API keys yet. Create one below.
                </TableCell>
              </TableRow>
            )}
            {keys.map((key) => (
              <TableRow key={key.id} className={key.revokedAt ? "opacity-60" : undefined}>
                <TableCell className="font-medium">{key.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {key.keyPrefix}…
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {key.scopes.map((scope) => (
                      <Badge key={scope} variant="outline" className="text-muted-foreground">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never"}
                </TableCell>
                <TableCell>
                  {key.revokedAt ? (
                    <Badge variant="outline" className="text-destructive">
                      Revoked
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-emerald-600">
                      Active
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!key.revokedAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => onRevoke(key.id)}
                    >
                      <ShieldOff className="size-3.5" />
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <form action={onCreate} className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
          <Input name="name" placeholder="Key name (e.g. CRM sync)" className="max-w-56" required />
          {SCOPE_OPTIONS.map((scope) => (
            <label key={scope.value} className="flex items-center gap-1.5 text-sm">
              <Checkbox name="scopes" value={scope.value} />
              {scope.label}
            </label>
          ))}
          <Button type="submit" size="sm" disabled={pending}>
            Create key
          </Button>
          {error && <span className="text-sm text-destructive">{error}</span>}
        </form>
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
