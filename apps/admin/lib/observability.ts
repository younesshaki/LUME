/**
 * Error monitoring & observability (SCRUM-113). Server-only, provider-agnostic.
 *
 * `captureError` emits one structured JSON line to stderr — Vercel log drains
 * and `vercel logs` pick these up as-is — and, when ERROR_WEBHOOK_URL is set,
 * forwards the same payload to any collector (Slack/Discord webhook, Axiom,
 * a custom endpoint). No vendor SDK: swapping in Sentry later means one new
 * transport function, not a rewrite.
 *
 * Identical errors are deduped in-memory per signature (scope + message) for
 * one minute so a hot failure loop cannot flood logs or the webhook. Capture
 * never throws — observability must not take a route down.
 */

export type ErrorContext = Record<string, string | number | boolean | null | undefined>;

export type CapturedError = {
  level: "error";
  scope: string;
  message: string;
  /** First stack frames, newline-joined — enough to locate, small enough to log. */
  stack: string | null;
  context: ErrorContext;
  /** Occurrences of this signature suppressed since the last emitted capture. */
  suppressed: number;
  at: string;
};

/** Opt-in, structured diagnostics for local/staging investigation. */
export function captureDebug(
  scope: string,
  detail: Record<string, unknown>,
): void {
  if (process.env.LUME_CHAT_DEBUG?.trim() !== "1") return;
  try {
    const serialized = JSON.stringify({
      level: "debug",
      scope,
      detail: boundedDebugDetail(detail),
      at: new Date().toISOString(),
    });
    // Keep debug output separate from captureError's error telemetry.
    console.info(serialized.slice(0, 12_000));
  } catch {
    // Debugging must never affect the request path.
  }
}

export type ConciergeTranscriptTurn = {
  sessionId: string;
  tenantId: string;
  /** Matches ConversationInventoryState.turn, so a transcript line and its
   * corresponding conversation-state debug line can be correlated. */
  turn: number;
  userText: string;
  assistantText: string;
  /** Which response path produced assistantText — the single most useful
   * field for spotting "this should have been deterministic but wasn't." */
  source: "deterministic" | "model" | "tool";
  actions: readonly Record<string, unknown>[];
  toolCalls?: readonly { name: string; result: unknown }[];
};

/**
 * One line per concierge turn with the FULL visitor message and FULL
 * assistant reply — deliberately not size-bounded per-field like
 * captureDebug, since a truncated transcript defeats the point of having
 * one. Tag "level":"transcript" so it can be grepped independently of the
 * lower-level "level":"debug" filter-state lines that share this same log
 * stream. Gated by the same LUME_CHAT_DEBUG flag — never on by default, and
 * this is server console output only, never sent to the visitor.
 */
export function captureConciergeTranscript(turn: ConciergeTranscriptTurn): void {
  if (process.env.LUME_CHAT_DEBUG?.trim() !== "1") return;
  try {
    const serialized = JSON.stringify({
      level: "transcript",
      scope: "api/chat/transcript",
      ...turn,
      at: new Date().toISOString(),
    });
    console.info(serialized.slice(0, 40_000));
  } catch {
    // Debugging must never affect the request path.
  }
}

const DEDUPE_WINDOW_MS = 60_000;
const MAX_TRACKED_SIGNATURES = 1_000;
const MAX_STACK_FRAMES = 8;

type SignatureState = { lastEmittedAt: number; suppressed: number };
const signatures = new Map<string, SignatureState>();

export function errorSignature(scope: string, error: unknown): string {
  return `${scope}:${messageOf(error)}`;
}

/**
 * Capture one error. Returns the emitted payload, or null when the signature
 * was suppressed by the dedupe window (still counted for the next emission).
 */
export function captureError(
  scope: string,
  error: unknown,
  context: ErrorContext = {},
  now: () => number = Date.now,
): CapturedError | null {
  try {
    const signature = errorSignature(scope, error);
    const at = now();

    if (signatures.size >= MAX_TRACKED_SIGNATURES) pruneSignatures(at);
    const state = signatures.get(signature);
    if (state && at - state.lastEmittedAt < DEDUPE_WINDOW_MS) {
      state.suppressed += 1;
      return null;
    }

    const payload: CapturedError = {
      level: "error",
      scope,
      message: messageOf(error),
      stack: stackOf(error),
      context: sanitizeContext(context),
      suppressed: state?.suppressed ?? 0,
      at: new Date(at).toISOString(),
    };
    signatures.set(signature, { lastEmittedAt: at, suppressed: 0 });

    console.error(JSON.stringify(payload));
    void forwardToWebhook(payload);
    return payload;
  } catch {
    return null; // Observability never breaks the caller.
  }
}

/**
 * Wrap a route handler: unhandled throws are captured and answered with a
 * generic 500 so stack details never reach the client.
 */
export function withRouteErrorCapture(
  scope: string,
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      captureError(scope, error, { url: new URL(request.url).pathname, method: request.method });
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}

/** Test hook. */
export function resetErrorDedupe(): void {
  signatures.clear();
}

async function forwardToWebhook(payload: CapturedError): Promise<void> {
  const url = process.env.ERROR_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
  } catch {
    // The structured console line above is the source of truth; webhook is best-effort.
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error)?.slice(0, 500) ?? "unknown error";
  } catch {
    return "unknown error";
  }
}

function stackOf(error: unknown): string | null {
  if (!(error instanceof Error) || !error.stack) return null;
  return error.stack.split("\n").slice(0, MAX_STACK_FRAMES).join("\n");
}

/** Drop undefined values and clamp strings so a log line stays a log line. */
function sanitizeContext(context: ErrorContext): ErrorContext {
  const out: ErrorContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue;
    out[key] = typeof value === "string" ? value.slice(0, 300) : value;
  }
  return out;
}

function boundedDebugDetail(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") out[key] = entry.slice(0, 300);
    else if (Array.isArray(entry)) out[key] = entry.slice(0, 30);
    else out[key] = entry;
  }
  return out;
}

function pruneSignatures(now: number): void {
  for (const [key, state] of signatures) {
    if (now - state.lastEmittedAt >= DEDUPE_WINDOW_MS) signatures.delete(key);
  }
}
