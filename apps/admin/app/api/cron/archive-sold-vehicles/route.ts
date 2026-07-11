import { timingSafeEqual } from "node:crypto";
import { archiveDueSoldVehicles } from "@lume/db";
import { createServiceClient } from "@lume/db/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "Archival job is not configured." }, { status: 503 });
  }
  if (!validBearerToken(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const archived = await archiveDueSoldVehicles(createServiceClient());
    return Response.json({ archived });
  } catch {
    return Response.json({ error: "Vehicle archival failed." }, { status: 500 });
  }
}

function validBearerToken(header: string | null, secret: string): boolean {
  const actual = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
