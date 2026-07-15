import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractVisitorPreferences,
  parseVisitorPreferences,
  shouldLearnVisitorPreferences,
  visitorPreferencesSystemPrompt,
  type VisitorPreferenceSession,
} from "@lume/bot";
import type { Database } from "@lume/db";
import type { VisitorPreferences } from "@lume/types";

type DbClient = SupabaseClient<Database, "public">;

const MAX_MESSAGE_LENGTH = 8_000;
const MAX_RECENT_SESSIONS = 20;
const MAX_LEARNING_MESSAGES = 200;
const MAX_KNOWN_MAKE_ROWS = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VisitorPreferenceTurn = {
  sessionId: string;
};

export type OpenVisitorPreferenceTurnInput = {
  tenantId: string;
  visitorId: string;
  requestedSessionId?: string | null;
  startNewSession?: boolean;
  userContent: string;
};

export type CompleteVisitorPreferenceTurnInput = {
  tenantId: string;
  visitorId: string;
  sessionId: string;
  assistantContent: string;
};

export type VisitorPreferenceIdentity = {
  tenantId: string;
  visitorId: string;
  enabled?: boolean;
};

/** The learning layer is deliberately opt-in; canonical history is not. */
export function isVisitorPreferenceLearningEnabled(
  value: string | undefined = process.env.VISITOR_PREFERENCE_LEARNING_ENABLED,
): boolean {
  return value?.trim().toLowerCase() === "true";
}

/**
 * Opens an owned session and stores the user turn observed by the canonical
 * chat route. A retry reconciles an unfinished turn instead of manufacturing
 * extra sessions (which would otherwise bring learning forward artificially).
 */
export async function openVisitorPreferenceTurn(
  client: DbClient,
  input: OpenVisitorPreferenceTurnInput,
): Promise<VisitorPreferenceTurn | null> {
  const userContent = boundedContent(input.userContent);
  if (!userContent) return null;

  try {
    const requestedSessionId = normalizeSessionId(input.requestedSessionId);
    let sessionId: string | null = null;
    let createdSession = false;

    if (requestedSessionId) {
      const owned = await findOwnedSession(client, input, requestedSessionId);
      if (owned.error) return null;
      sessionId = owned.id;
      if (!sessionId && input.startNewSession) {
        const { data, error } = await client
          .from("chat_sessions")
          .insert({
            id: requestedSessionId,
            tenant_id: input.tenantId,
            visitor_id: input.visitorId,
          })
          .select("id")
          .single();
        if (error || !data) return null;
        sessionId = data.id;
        createdSession = true;
      }
    } else if (!input.startNewSession) {
      const latest = await findLatestOwnedSession(client, input);
      if (latest.error) return null;
      if (latest.id) {
        const latestMessage = await findLatestObservedMessage(
          client,
          input.tenantId,
          latest.id,
        );
        if (latestMessage.error) return null;
        // A completed session belongs to the previous browser conversation;
        // an unfinished one is safe to resume after a failed request.
        if (latestMessage.message?.role !== "assistant") sessionId = latest.id;
      }
    }

    if (!sessionId) {
      const { data, error } = await client
        .from("chat_sessions")
        .insert({ tenant_id: input.tenantId, visitor_id: input.visitorId })
        .select("id")
        .single();
      if (error || !data) return null;
      sessionId = data.id;
      createdSession = true;
    }

    if (createdSession) {
      // Operational outcome: this is emitted only after a real, owned chat
      // session exists. A reporting failure must never interrupt chat.
      void recordChatStarted(client, input.tenantId, input.visitorId);
    }

    const latestMessage = await findLatestObservedMessage(client, input.tenantId, sessionId);
    if (latestMessage.error) return null;

    if (latestMessage.message?.role === "user") {
      if (latestMessage.message.content !== userContent) {
        const { error } = await client
          .from("chat_messages")
          .update({ content: userContent })
          .eq("tenant_id", input.tenantId)
          .eq("session_id", sessionId)
          .eq("id", latestMessage.message.id)
          .eq("role", "user")
          .eq("is_server_observed", true);
        if (error) return null;
      }
    } else {
      const { error } = await client.from("chat_messages").insert({
        tenant_id: input.tenantId,
        session_id: sessionId,
        role: "user",
        content: userContent,
        is_server_observed: true,
      });
      if (error) return null;
    }

    return { sessionId };
  } catch {
    return null;
  }
}

async function recordChatStarted(client: DbClient, tenantId: string, visitorId: string): Promise<void> {
  try {
    await client.from("conversion_events").insert({
      tenant_id: tenantId,
      visitor_id: visitorId,
      event_name: "chat_started",
      event_category: "operational",
      metadata: {},
    });
  } catch {
    // Conversion reporting is strictly best-effort for a real chat action.
  }
}

/** Persists the real model output, touches the owned session, then learns best-effort. */
export async function completeVisitorPreferenceTurn(
  client: DbClient,
  input: CompleteVisitorPreferenceTurnInput,
): Promise<boolean> {
  const assistantContent = boundedContent(input.assistantContent);
  const sessionId = normalizeSessionId(input.sessionId);
  if (!assistantContent || !sessionId) return false;

  try {
    const owned = await findOwnedSession(client, input, sessionId);
    if (owned.error || !owned.id) return false;

    const latest = await findLatestObservedMessage(client, input.tenantId, owned.id);
    if (latest.error) return false;

    if (latest.message?.role === "assistant") {
      if (latest.message.content !== assistantContent) {
        const { error } = await client
          .from("chat_messages")
          .update({ content: assistantContent })
          .eq("tenant_id", input.tenantId)
          .eq("session_id", owned.id)
          .eq("id", latest.message.id)
          .eq("role", "assistant")
          .eq("is_server_observed", true);
        if (error) return false;
      }
    } else {
      const { error } = await client.from("chat_messages").insert({
        tenant_id: input.tenantId,
        session_id: owned.id,
        role: "assistant",
        content: assistantContent,
        is_server_observed: true,
      });
      if (error) return false;
    }

    const { error: touchError } = await client
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("tenant_id", input.tenantId)
      .eq("visitor_id", input.visitorId)
      .eq("id", owned.id);
    if (touchError) return false;

    await recomputeVisitorPreferences(client, input);
    return true;
  } catch {
    return false;
  }
}

/** Loads only schema-validated, normalized data and fails closed. */
export async function loadVisitorPreferenceContext(
  client: DbClient,
  input: VisitorPreferenceIdentity,
): Promise<VisitorPreferences | null> {
  if (!learningEnabled(input.enabled)) return null;
  try {
    const { data, error } = await client
      .from("visitor_profiles")
      .select("preferences")
      .eq("tenant_id", input.tenantId)
      .eq("visitor_id", input.visitorId)
      .maybeSingle();
    if (error || !data) return null;
    return parseVisitorPreferences(data.preferences);
  } catch {
    return null;
  }
}

/** Prompt rendering is also guarded so a caller cannot accidentally enable learning. */
export function visitorPreferenceSystemPrompt(
  preferences: VisitorPreferences | null,
  enabled = isVisitorPreferenceLearningEnabled(),
): string {
  return enabled ? visitorPreferencesSystemPrompt(preferences) : "";
}

/**
 * Rebuilds a profile from a bounded set of trusted turns. Browser-written
 * history is intentionally excluded by both role and provenance filters.
 */
export async function recomputeVisitorPreferences(
  client: DbClient,
  input: VisitorPreferenceIdentity,
): Promise<VisitorPreferences | null> {
  if (!learningEnabled(input.enabled)) return null;

  try {
    const { data: sessionRows, error: sessionError } = await client
      .from("chat_sessions")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("visitor_id", input.visitorId)
      .order("updated_at", { ascending: false })
      .limit(MAX_RECENT_SESSIONS);
    if (sessionError || !sessionRows?.length) return null;

    // The query is newest-first for the bounded window; extraction requires
    // chronological sessions so its reverse scan gives the newest turn
    // precedence (notably for an updated budget).
    const sessionIds = sessionRows.map((row) => row.id).reverse();
    const { data: messageRows, error: messageError } = await client
      .from("chat_messages")
      .select("session_id, role, content")
      .eq("tenant_id", input.tenantId)
      .eq("is_server_observed", true)
      .in("session_id", sessionIds)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(MAX_LEARNING_MESSAGES);
    if (messageError) return null;

    const trustedBySession = new Map<string, VisitorPreferenceSession["messages"]>();
    const completedSessionIds = new Set(
      (messageRows ?? [])
        .filter((row) => row.role === "assistant")
        .map((row) => row.session_id),
    );
    // The bounded query is newest-first so it retains current intent. Reverse
    // the selected rows before grouping to preserve chronological messages.
    for (const row of [...(messageRows ?? [])].reverse()) {
      if (row.role !== "user" || !completedSessionIds.has(row.session_id)) continue;
      const messages = trustedBySession.get(row.session_id) ?? [];
      trustedBySession.set(row.session_id, [
        ...messages,
        { role: "user", content: row.content },
      ]);
    }
    const sessions: VisitorPreferenceSession[] = sessionIds.flatMap((id) => {
      const messages = trustedBySession.get(id);
      return completedSessionIds.has(id) && messages?.length ? [{ messages }] : [];
    });
    if (!shouldLearnVisitorPreferences(sessions.length)) return null;

    const { data: vehicleRows, error: vehicleError } = await client
      .from("vehicles")
      .select("make")
      .eq("tenant_id", input.tenantId)
      .eq("status", "live")
      .limit(MAX_KNOWN_MAKE_ROWS);
    if (vehicleError) return null;

    const preferences = extractVisitorPreferences(sessions, {
      knownMakes: (vehicleRows ?? []).map((row) => row.make),
    });
    if (!preferences) return null;

    const { error: upsertError } = await client.from("visitor_profiles").upsert(
      {
        tenant_id: input.tenantId,
        visitor_id: input.visitorId,
        preferences: {
          preferredMakes: preferences.preferredMakes,
          bodyStyles: preferences.bodyStyles,
          budget: preferences.budget,
        },
        learned_session_count: sessions.length,
      },
      { onConflict: "tenant_id,visitor_id" },
    );
    return upsertError ? null : preferences;
  } catch {
    return null;
  }
}

function learningEnabled(explicit: boolean | undefined): boolean {
  return explicit ?? isVisitorPreferenceLearningEnabled();
}

function boundedContent(value: string): string {
  return value.trim().slice(0, MAX_MESSAGE_LENGTH);
}

function normalizeSessionId(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

async function findOwnedSession(
  client: DbClient,
  identity: Pick<VisitorPreferenceIdentity, "tenantId" | "visitorId">,
  sessionId: string,
): Promise<{ id: string | null; error: boolean }> {
  const { data, error } = await client
    .from("chat_sessions")
    .select("id")
    .eq("tenant_id", identity.tenantId)
    .eq("visitor_id", identity.visitorId)
    .eq("id", sessionId)
    .maybeSingle();
  return { id: data?.id ?? null, error: Boolean(error) };
}

async function findLatestOwnedSession(
  client: DbClient,
  identity: Pick<VisitorPreferenceIdentity, "tenantId" | "visitorId">,
): Promise<{ id: string | null; error: boolean }> {
  const { data, error } = await client
    .from("chat_sessions")
    .select("id")
    .eq("tenant_id", identity.tenantId)
    .eq("visitor_id", identity.visitorId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { id: data?.id ?? null, error: Boolean(error) };
}

async function findLatestObservedMessage(
  client: DbClient,
  tenantId: string,
  sessionId: string,
): Promise<{
  message: { id: string; role: "user" | "assistant" | "system"; content: string } | null;
  error: boolean;
}> {
  const { data, error } = await client
    .from("chat_messages")
    .select("id, role, content")
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId)
    .eq("is_server_observed", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { message: data ?? null, error: Boolean(error) };
}
