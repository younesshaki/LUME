/**
 * POST /api/chat
 *
 * Public, tenant-scoped chat endpoint. Builds the system prompt server-side
 * from the tenant's RAG corpus + vehicle inventory, then streams Deepseek's
 * SSE response back unchanged.
 *
 * The client SHOULD NOT send a system prompt — anything received in
 * `messages` with role: "system" is dropped. The tenant is resolved from the
 * X-Lume-Tenant header (or ?tenant= or subdomain — see lib/tenant.ts).
 */
import type { ChatMessage, ChatRequest } from "@lume/types";
import { createServiceClient } from "@lume/db/server";
import { rowToVehicle } from "@lume/db";
import {
  assembleSystemPrompt,
  extractVehicleFilters,
  isVehicleQuery,
  matchVehicles,
  retrieveByKeywords,
} from "@lume/rag";
import { getTenantFromRequest } from "@/lib/tenant";
import { corsHeadersFor, isAllowedOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGES = 30;
const MAX_USER_CONTENT_LENGTH = 4_000;

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) });
}

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) {
    return json({ error: "Forbidden origin" }, 403);
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return json({ error: "Invalid JSON" }, 400, request);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: "messages must be a non-empty array" }, 400, request);
  }
  if (body.messages.length > MAX_MESSAGES) {
    return json({ error: `messages must be ≤ ${MAX_MESSAGES}` }, 400, request);
  }

  // Drop any client-supplied system messages — only the server defines those.
  const cleanMessages: ChatMessage[] = body.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role,
      content: String(m.content ?? "").slice(0, MAX_USER_CONTENT_LENGTH),
    }));

  const lastUser = [...cleanMessages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return json({ error: "no user message found" }, 400, request);
  }

  // Resolve tenant.
  const tenant = await getTenantFromRequest(request);
  if (!tenant) {
    return json({ error: "Unknown or inactive tenant" }, 404, request);
  }

  // Build the tenant-scoped system prompt. Keyword + fuzzy retrieval over
  // this tenant's chunks — no embedder needed. When the corpus outgrows
  // in-memory scoring (~thousands of chunks), swap retrieveByKeywords()
  // for retrieveContext() from @lume/rag/server + an embedder.
  const supabase = createServiceClient();

  let assembled;
  try {
    const { data: chunkRows, error: chunkErr } = await supabase
      .from("rag_chunks")
      .select("text, category")
      .eq("tenant_id", tenant.tenantId);
    if (chunkErr) throw new Error(`rag_chunks query failed: ${chunkErr.message}`);

    const contextChunks = retrieveByKeywords(
      chunkRows ?? [],
      lastUser.content,
      7
    );

    let matchedVehicles;
    let totalMatched: number | undefined;
    let totalInventory: number | undefined;
    let filters;

    if (isVehicleQuery(lastUser.content)) {
      // Pull this tenant's vehicles for filter extraction + matching.
      // For very large catalogs, replace this with a server-side filtered
      // query using the same filter logic.
      const { data: vehicleRows } = await supabase
        .from("vehicles")
        .select("*")
        .eq("tenant_id", tenant.tenantId);
      const vehicles = (vehicleRows ?? []).map(rowToVehicle);
      filters = extractVehicleFilters(lastUser.content, vehicles);
      const match = matchVehicles(vehicles, filters, lastUser.content);
      matchedVehicles = match.results;
      totalMatched = match.totalMatched;
      totalInventory = vehicles.length;
    }

    assembled = assembleSystemPrompt({
      contextChunks,
      matchedVehicles,
      totalMatched,
      totalInventory,
      filters,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "RAG failure";
    console.error("[/api/chat] RAG error:", message);
    return json({ error: "Failed to build context" }, 500, request);
  }

  // Forward to Deepseek.
  const deepseekUrl =
    process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/v1/chat/completions";
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekKey) {
    return json({ error: "DEEPSEEK_API_KEY not configured" }, 500, request);
  }

  const upstream = await fetch(deepseekUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deepseekKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      stream: body.stream ?? true,
      messages: [
        { role: "system", content: assembled.prompt },
        ...cleanMessages,
      ],
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return json(
      { error: `Deepseek error ${upstream.status}: ${text}` },
      upstream.status,
      request
    );
  }

  // Pass-through SSE. Prepend a one-line `data: { type: "meta", ... }` event
  // so the client can know which source categories were used.
  const cors = corsHeadersFor(request);
  const headers = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Source-Categories": assembled.sourceCategories.join(","),
    ...cors,
  });

  if (!upstream.body) {
    return json({ error: "No upstream body" }, 502, request);
  }

  const meta = `data: ${JSON.stringify({
    type: "meta",
    sourceCategories: assembled.sourceCategories,
  })}\n\n`;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(meta));
      const reader = upstream.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream failure";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message })}\n\n`
          )
        );
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(stream, { headers });
}

function json(payload: unknown, status: number, request?: Request): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(request ? corsHeadersFor(request) : {}),
    },
  });
}
