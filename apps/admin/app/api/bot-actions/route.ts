/**
 * Validate bot actions before a public client executes them (SCRUM-93).
 *
 * This route deliberately does not execute UI actions server-side. It binds
 * the request to an active tenant and returns only a validated action shape;
 * the public site's action bus remains the execution boundary.
 */
import type { BotActionResponse } from "@lume/types";
import { validateBotActionEnvelope } from "@/lib/botActions";
import { corsHeadersFor, isAllowedOrigin } from "@/lib/origin";
import { getTenantFromRequest } from "@/lib/tenant";
import { recordPublicApiUsage } from "@/lib/usage.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) });
}

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) {
    return json(failure("FORBIDDEN_ORIGIN", "Forbidden origin"), 403);
  }

  const tenant = await getTenantFromRequest(request);
  if (!tenant) {
    return json(failure("UNKNOWN_TENANT", "Unknown or inactive tenant"), 404, request);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(failure("INVALID_JSON", "Invalid JSON"), 400, request);
  }

  const validation = validateBotActionEnvelope(body);
  if (!validation.ok) {
    return json(failure("INVALID_ACTION", validation.error), 400, request);
  }
  await recordPublicApiUsage(tenant.tenantId, "bot_action_requests");

  const response: BotActionResponse = {
    action: validation.value.action,
    status: "success",
    message: "Action validated",
  };
  return json(response, 200, request);
}

function failure(code: string, message: string) {
  return {
    status: "failure",
    message,
    error: { code },
  } as const;
}

function json(payload: unknown, status: number, request?: Request): Response {
  return Response.json(payload, {
    status,
    headers: request ? corsHeadersFor(request) : undefined,
  });
}
