"use client";

import * as React from "react";
import { Bot, ExternalLink, RotateCcw, Send } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type ConciergeResult = {
  reply: string;
  action?: { type: "navigate"; href: string; label: string };
  results?: Array<{ id: string; label: string; price: number; status: string }>;
  details?: Array<{ id: string; label: string; value: string; note?: string }>;
  candidates?: Array<{ id: string; label: string; status: string }>;
  candidatesSelectable?: boolean;
  command?: {
    id: string;
    expiresAt: string;
    capabilityId: "lead.status.update" | "feed.run.enqueue";
    summary: string;
  };
};

/**
 * The dashboard concierge is a presentation layer, never an authority. Its
 * API performs authorization, fresh tenant-scoped reads, and the reviewed
 * command lifecycle; this client only renders server-issued results and lets
 * an operator explicitly confirm a supported change.
 */
export function AdminConciergePanel({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [result, setResult] = React.useState<ConciergeResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [turns, setTurns] = React.useState<Array<{ role: "user" | "assistant"; content: string }>>([]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    await sendMessage(text);
  }

  function navigateToServerIssuedHref(href: string | undefined) {
    // Defense in depth: a route is issued by the server but never allow this
    // presentation component to become an open redirect.
    if (!href || !href.startsWith(`/admin/${encodeURIComponent(tenantSlug)}`)) return;
    setOpen(false);
    router.push(href);
  }

  async function sendMessage(text: string, options?: { autoNavigate?: boolean; displayText?: string }) {
    if (!text || pending) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/admin/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug, message: text, currentPath: pathname, sessionId: getAdminSessionId(tenantSlug) }),
      });
      const payload = (await response.json().catch(() => null)) as ConciergeResult & { error?: string } | null;
      const reply = payload?.reply;
      if (!response.ok || !reply) {
        setError(payload?.error ?? "The dashboard concierge is temporarily unavailable.");
        return;
      }
      setResult(payload);
      setTurns((previous) => [
        ...previous,
        { role: "user" as const, content: options?.displayText ?? text },
        { role: "assistant" as const, content: reply },
      ].slice(-10));
      setMessage("");
      if (options?.autoNavigate) navigateToServerIssuedHref(payload.action?.href);
    } catch {
      setError("The dashboard concierge is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  function navigate() {
    navigateToServerIssuedHref(result?.action?.href);
  }

  function openVerifiedResult(index: number, label: string) {
    const ordinal = ["first", "second", "third", "fourth", "fifth"][index];
    if (!ordinal) return;
    // Do not construct an ID or admin URL on the client. The command is
    // resolved against the short-lived server-owned result set, then the
    // server-issued navigation action is followed only after it verifies.
    void sendMessage(`open the ${ordinal} one`, {
      autoNavigate: true,
      displayText: `Open ${label}`,
    });
  }

  async function confirmCommand() {
    const command = result?.command;
    if (!command || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/concierge/commands/${command.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug }),
      });
      const payload = (await response.json().catch(() => null)) as { reply?: string; error?: string } | null;
      const reply = payload?.reply;
      if (!response.ok || !reply) {
        setError(payload?.error ?? "The reviewed command could not be completed.");
        // A command that is stale, expired, missing, or already terminal must
        // not remain actionable in the UI. The operator can ask LUME to
        // prepare a fresh, newly verified preview instead.
        if (response.status === 404 || response.status === 409 || response.status === 410) {
          setResult((previous) => previous ? { ...previous, command: undefined } : previous);
        }
        return;
      }
      setResult({ reply });
      setTurns((previous) => [...previous, { role: "assistant" as const, content: reply }].slice(-10));
    } catch {
      setError("The reviewed command could not be completed.");
    } finally {
      setConfirming(false);
    }
  }

  function startNewConversation() {
    window.sessionStorage.setItem(`lume-admin-concierge-session:${tenantSlug}`, crypto.randomUUID());
    setTurns([]);
    setResult(null);
    setError(null);
    setMessage("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Bot className="size-3.5" aria-hidden="true" />
        <span className="hidden md:inline">Ask LUME</span>
      </Button>
      <DialogContent className="sm:max-w-xl" aria-describedby="admin-concierge-description">
        <DialogHeader>
          <DialogTitle>Dashboard concierge</DialogTitle>
          <DialogDescription id="admin-concierge-description">
            Ask LUME to find verified tenant data or open a dashboard area. Changes will always be previewed and require your approval when supported.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/25 p-3 text-xs text-muted-foreground">
          <span>Try: “show BMW vehicles under 70k”, “list new leads”, or “take me to inventory feeds”.</span>
          <Button type="button" variant="ghost" size="sm" className="-my-1 shrink-0 text-xs" onClick={startNewConversation}>
            <RotateCcw className="size-3" aria-hidden="true" />
            New
          </Button>
        </div>

        {turns.length ? (
          <ol className="max-h-44 space-y-2 overflow-y-auto pr-1 text-sm" aria-label="Current concierge conversation">
            {turns.map((turn, index) => (
              <li
                key={`${turn.role}-${index}`}
                className={turn.role === "user" ? "ml-8 rounded-md bg-primary px-3 py-2 text-primary-foreground" : "mr-8 rounded-md bg-muted px-3 py-2 text-foreground"}
              >
                {turn.content}
              </li>
            ))}
          </ol>
        ) : null}

        <form onSubmit={submit} className="flex gap-2">
          <Input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="What would you like to do?"
            aria-label="Dashboard concierge request"
            maxLength={2_000}
            autoFocus
          />
          <Button type="submit" size="icon" disabled={pending || !message.trim()} aria-label="Send request">
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </form>

        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {result ? (
          <section aria-live="polite" className="space-y-3 rounded-lg border p-3">
            <p className="text-sm leading-6">{result.reply}</p>
            {result.results?.length ? (
              <ul className="space-y-1.5 text-sm">
                {result.results.map((vehicle, index) => (
                  <li key={vehicle.id} className="flex justify-between gap-3 text-muted-foreground">
                    <button
                      type="button"
                      className="min-w-0 truncate text-left text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => openVerifiedResult(index, vehicle.label)}
                      disabled={pending}
                    >
                      {vehicle.label}
                    </button>
                    <span className="shrink-0">${vehicle.price.toLocaleString()} · {vehicle.status}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {result.details?.length ? (
              <ul className="space-y-2 text-sm text-muted-foreground">
                {result.details.map((detail) => (
                  <li key={detail.id} className="rounded-md border bg-muted/20 p-2">
                    <p className="font-medium text-foreground">{detail.label}</p>
                    <p className="mt-0.5">{detail.value}</p>
                    {detail.note ? <p className="mt-1 text-xs leading-5">{detail.note}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {result.candidates?.length ? (
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {result.candidates.map((lead, index) => (
                  <li key={lead.id} className="flex justify-between gap-3">
                    {result.candidatesSelectable ? (
                      <button
                        type="button"
                        className="min-w-0 truncate text-left text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => openVerifiedResult(index, lead.label)}
                        disabled={pending}
                      >
                        {lead.label}
                      </button>
                    ) : <span className="min-w-0 truncate text-foreground">{lead.label}</span>}
                    <span className="shrink-0 capitalize">{lead.status}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {result.command ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-sm font-medium">Review required</p>
                <p className="mt-1 text-sm text-muted-foreground">{result.command.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This confirmation expires {new Date(result.command.expiresAt).toLocaleTimeString()}.
                </p>
                <Button type="button" size="sm" className="mt-3" onClick={confirmCommand} disabled={confirming}>
                  {confirming ? "Confirming…" : "Confirm change"}
                </Button>
              </div>
            ) : null}
            {result.action ? (
              <Button type="button" size="sm" variant="outline" onClick={navigate}>
                <ExternalLink className="size-3.5" aria-hidden="true" />
                {result.action.label}
              </Button>
            ) : null}
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function getAdminSessionId(tenantSlug: string): string {
  const key = `lume-admin-concierge-session:${tenantSlug}`;
  const existing = window.sessionStorage.getItem(key);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(key, created);
  return created;
}
