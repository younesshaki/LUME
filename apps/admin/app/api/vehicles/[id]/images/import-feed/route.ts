import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { after } from "next/server";
import { enqueueVehicleImageDescription, validateUploadWithBytes } from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { captureError } from "@/lib/observability";
import { readR2VehicleImageConfig } from "@/lib/r2Config";
import { deleteR2Object } from "@/lib/r2Objects.server";
import { presignR2Request } from "@/lib/r2Signing";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  buildVehicleImageR2Key,
  MAX_VEHICLE_IMAGE_BYTES,
  MAX_VEHICLE_IMAGES,
  type VehicleImageContentType,
} from "@/lib/vehicleImages";
import { authorizeVehicleImageRequest } from "@/lib/vehicleImages.server";
import {
  parseFeedVehicleImageImport,
  selectFeedVehicleImageUrls,
} from "@/lib/feedVehicleImages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type ImportedImage = {
  id: string;
  r2_key: string;
  source_url: string | null;
  content_type: VehicleImageContentType;
  byte_size: number;
  width: number | null;
  height: number | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
};

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id: vehicleId } = await context.params;
  const authorization = await authorizeVehicleImageRequest(request, vehicleId);
  if (!authorization.ok) return json({ error: authorization.error }, authorization.status);

  const requested = parseFeedVehicleImageImport(await readJson(request));
  if (!requested) return json({ error: "Choose one or more saved feed images to import." }, 400);

  const limited = checkRateLimit(`vehicle-feed-image-import:${authorization.userId}`, {
    limit: 20,
    windowMs: 60 * 60 * 1_000,
  });
  if (!limited.allowed) {
    return json({ error: "Too many feed-image imports. Try again later." }, 429, {
      "Retry-After": String(limited.retryAfterSeconds),
    });
  }

  const config = readR2VehicleImageConfig();
  if (!config) return json({ error: "Vehicle image storage is not configured." }, 503);

  const { data: vehicle, error: vehicleError } = await authorization.supabase
    .from("vehicles")
    .select("image_src, feed_image_urls")
    .eq("tenant_id", authorization.tenant.tenantId)
    .eq("id", vehicleId)
    .maybeSingle();
  if (vehicleError) {
    return json({ error: "Feed image metadata is unavailable. Apply migration 075_vehicle_feed_sync_images.sql first." }, 503);
  }
  if (!vehicle) return json({ error: "Vehicle not found." }, 404);

  const urls = selectFeedVehicleImageUrls(vehicle, requested);
  if (urls.length === 0) return json({ error: "Those feed images do not belong to this vehicle." }, 400);

  const { data: existing, error: existingError } = await authorization.supabase
    .from("vehicle_images")
    .select("id, source_url")
    .eq("tenant_id", authorization.tenant.tenantId)
    .eq("vehicle_id", vehicleId);
  if (existingError) return json({ error: "Vehicle image metadata is unavailable." }, 503);

  const sourceUrls = new Set((existing ?? []).flatMap((image) => image.source_url ? [image.source_url] : []));
  const capacity = Math.max(0, MAX_VEHICLE_IMAGES - (existing?.length ?? 0));
  const pending = urls.filter((url) => !sourceUrls.has(url)).slice(0, capacity);
  const images: ImportedImage[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  for (const url of pending) {
    try {
      images.push(await importOne({
        url,
        vehicleId,
        tenantId: authorization.tenant.tenantId,
        tenantSlug: authorization.tenant.slug,
        supabase: authorization.supabase,
      }));
    } catch (error) {
      errors.push({
        url,
        error: error instanceof Error ? error.message : "Could not import this feed image.",
      });
    }
  }

  if (images.length > 0) {
    after(async () => {
      await Promise.all(images.map((image) => enqueueVehicleImageDescription(
        createServiceClient(), authorization.tenant.tenantId, image.id,
      ).catch((error: unknown) => {
        captureError("api/vehicles/images/import-feed/description-enqueue", error, {
          tenantId: authorization.tenant.tenantId,
          imageId: image.id,
        });
      })));
    });
  }

  if (images.length === 0 && errors.length > 0) {
    return json({ error: errors[0]?.error ?? "Could not import the selected feed images.", errors }, 502);
  }
  return json({ imported: images.length, skipped: urls.length - pending.length, errors }, 200);
}

type AuthorizedClient = Extract<
  Awaited<ReturnType<typeof authorizeVehicleImageRequest>>,
  { ok: true }
>["supabase"];

async function importOne(input: {
  url: string;
  vehicleId: string;
  tenantId: string;
  tenantSlug: string;
  supabase: AuthorizedClient;
}): Promise<ImportedImage> {
  await assertPublicRemoteUrl(input.url);
  const response = await fetch(input.url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Feed image returned HTTP ${response.status}.`);
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_VEHICLE_IMAGE_BYTES) {
    throw new Error("Feed image is larger than 10 MB.");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_VEHICLE_IMAGE_BYTES) throw new Error("Feed image is larger than 10 MB.");
  const contentType = imageContentType(bytes);
  if (!contentType) throw new Error("Feed image must be a JPEG, PNG, or WebP file.");
  const validated = validateUploadWithBytes(
    "tenant-media",
    { type: contentType, size: bytes.byteLength },
    bytes.subarray(0, 512),
  );
  if (!validated.ok) throw new Error(validated.error);

  const config = readR2VehicleImageConfig();
  if (!config) throw new Error("Vehicle image storage is not configured.");
  const r2Key = buildVehicleImageR2Key(input.tenantSlug, input.vehicleId, randomUUID(), contentType);
  const upload = presignR2Request({
    endpoint: config.endpoint,
    bucket: config.bucket,
    key: r2Key,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    method: "PUT",
    uploadHeaders: { contentType, contentLength: bytes.byteLength },
    expiresInSeconds: 10 * 60,
  });
  const stored = await fetch(upload.url, {
    method: upload.method,
    headers: { "Content-Type": contentType, "Content-Length": String(bytes.byteLength) },
    body: bytes,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!stored.ok) throw new Error("Unable to store the imported image in R2.");

  const { data, error } = await input.supabase
    .from("vehicle_images")
    .insert({
      tenant_id: input.tenantId,
      vehicle_id: input.vehicleId,
      r2_key: r2Key,
      source_url: input.url,
      content_type: contentType,
      byte_size: bytes.byteLength,
      width: null,
      height: null,
    })
    .select("id, r2_key, source_url, content_type, byte_size, width, height, sort_order, is_primary, created_at")
    .single();
  if (error || !data) {
    await deleteR2Object(config, r2Key);
    if (error?.code === "23505") {
      const { data: existing } = await input.supabase
        .from("vehicle_images")
        .select("id, r2_key, source_url, content_type, byte_size, width, height, sort_order, is_primary, created_at")
        .eq("tenant_id", input.tenantId)
        .eq("vehicle_id", input.vehicleId)
        .eq("source_url", input.url)
        .maybeSingle();
      if (existing) return existing;
    }
    throw new Error(error?.message ?? "Unable to save imported image metadata.");
  }
  return data;
}

async function assertPublicRemoteUrl(value: string): Promise<void> {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Feed image host is not publicly reachable.");
  }
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("Feed image host is not publicly reachable.");
  }
}

function isPublicAddress(value: string): boolean {
  if (isIP(value) === 4) {
    const [a = 0, b = 0] = value.split(".").map(Number);
    return a !== 0 && a !== 10 && a !== 127 && a < 224
      && !(a === 100 && b >= 64 && b <= 127)
      && !(a === 169 && b === 254)
      && !(a === 172 && b >= 16 && b <= 31)
      && !(a === 192 && b === 168)
      && !(a === 198 && (b === 18 || b === 19));
  }
  const normalized = value.toLowerCase();
  return normalized !== "::1" && !normalized.startsWith("fe80:")
    && !normalized.startsWith("fc") && !normalized.startsWith("fd");
}

function imageContentType(bytes: Uint8Array): VehicleImageContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 12 && text(bytes, 0, 4) === "RIFF" && text(bytes, 8, 12) === "WEBP") return "image/webp";
  return null;
}

function text(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function json(payload: unknown, status: number, headers: Record<string, string> = {}): Response {
  return Response.json(payload, { status, headers: { "Cache-Control": "private, no-store", ...headers } });
}
