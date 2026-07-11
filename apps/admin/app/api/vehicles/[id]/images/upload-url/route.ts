import { randomUUID } from "node:crypto";
import { presignR2Request } from "@/lib/r2Signing";
import { readR2VehicleImageConfig } from "@/lib/r2Config";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  MAX_VEHICLE_IMAGES,
  buildVehicleImageR2Key,
  parseVehicleImageUploadRequest,
} from "@/lib/vehicleImages";
import {
  authorizeVehicleImageRequest,
} from "@/lib/vehicleImages.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id: vehicleId } = await context.params;
  const authorization = await authorizeVehicleImageRequest(request, vehicleId);
  if (!authorization.ok) return json({ error: authorization.error }, authorization.status);

  const config = readR2VehicleImageConfig();
  if (!config) {
    return json({ error: "Vehicle image storage is not configured." }, 503);
  }

  const payload = parseVehicleImageUploadRequest(await readJson(request));
  if (!payload) {
    return json({ error: "Choose a JPEG, PNG, or WebP image up to 10 MB." }, 400);
  }

  const rateLimit = checkRateLimit(`vehicle-image-url:${authorization.userId}`, {
    limit: 40,
    windowMs: 60 * 60 * 1_000,
  });
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many image upload requests. Try again later." },
      {
        status: 429,
        headers: {
          "Cache-Control": "private, no-store",
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const { count, error: countError } = await authorization.supabase
    .from("vehicle_images")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", authorization.tenant.tenantId)
    .eq("vehicle_id", vehicleId);
  if (countError) {
    return json({ error: "Vehicle image metadata is not configured." }, 503);
  }
  if ((count ?? 0) >= MAX_VEHICLE_IMAGES) {
    return json({ error: `A vehicle may have at most ${MAX_VEHICLE_IMAGES} images.` }, 409);
  }

  const r2Key = buildVehicleImageR2Key(
    authorization.tenant.slug,
    vehicleId,
    randomUUID(),
    payload.contentType,
  );
  const signed = presignR2Request({
    endpoint: config.endpoint,
    bucket: config.bucket,
    key: r2Key,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    method: "PUT",
    uploadHeaders: {
      contentType: payload.contentType,
      contentLength: payload.byteSize,
    },
    expiresInSeconds: 10 * 60,
  });

  return json({
    uploadUrl: signed.url,
    r2Key,
    expiresAt: signed.expiresAt.toISOString(),
    requiredHeaders: { "Content-Type": payload.contentType },
  }, 200);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function json(payload: unknown, status: number): Response {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
