import { presignR2Request } from "@/lib/r2Signing";
import {
  readR2VehicleImageConfig,
} from "@/lib/r2Config";
import { deleteR2Object } from "@/lib/r2Objects.server";
import {
  isExpectedVehicleImageR2Key,
  parseVehicleImageConfirmation,
  vehicleImagePublicUrl,
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
  if (!config) return json({ error: "Vehicle image storage is not configured." }, 503);

  const payload = parseVehicleImageConfirmation(await readJson(request));
  if (
    !payload ||
    !isExpectedVehicleImageR2Key(
      payload.r2Key,
      authorization.tenant.slug,
      vehicleId,
    )
  ) {
    return json({ error: "Invalid vehicle image confirmation." }, 400);
  }

  const existing = await findImageByKey(
    authorization.supabase,
    authorization.tenant.tenantId,
    payload.r2Key,
  );
  if (existing) {
    if (
      existing.content_type !== payload.contentType ||
      existing.byte_size !== payload.byteSize
    ) {
      return json({ error: "Existing image metadata does not match the confirmation." }, 409);
    }
    return imageResponse(existing, config.publicBaseUrl, 200);
  }

  const headRequest = presignR2Request({
    endpoint: config.endpoint,
    bucket: config.bucket,
    key: payload.r2Key,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    method: "HEAD",
    expiresInSeconds: 60,
  });
  let storedObject: Response;
  try {
    storedObject = await fetch(headRequest.url, {
      method: headRequest.method,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return json({ error: "Unable to verify the uploaded R2 object." }, 502);
  }
  if (!storedObject.ok) {
    return json({ error: "The uploaded R2 object was not found." }, 409);
  }
  if (!storedMetadataMatches(storedObject.headers, payload.contentType, payload.byteSize)) {
    await deleteR2Object(config, payload.r2Key);
    return json({ error: "Uploaded object metadata does not match the confirmation." }, 409);
  }

  const { data, error } = await authorization.supabase
    .from("vehicle_images")
    .insert({
      tenant_id: authorization.tenant.tenantId,
      vehicle_id: vehicleId,
      r2_key: payload.r2Key,
      content_type: payload.contentType,
      byte_size: payload.byteSize,
      width: payload.width,
      height: payload.height,
    })
    .select("id, r2_key, content_type, byte_size, width, height, sort_order, is_primary, created_at")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      const racedImage = await findImageByKey(
        authorization.supabase,
        authorization.tenant.tenantId,
        payload.r2Key,
      );
      if (racedImage) return imageResponse(racedImage, config.publicBaseUrl, 200);
    }
    await deleteR2Object(config, payload.r2Key);
    const status = error?.message.includes("at most 20") ? 409 : 500;
    return json({ error: status === 409 ? error?.message : "Unable to save vehicle image metadata." }, status);
  }

  return imageResponse(data, config.publicBaseUrl, 201);
}

type ImageRow = {
  id: string;
  r2_key: string;
  content_type: "image/jpeg" | "image/png" | "image/webp";
  byte_size: number;
  width: number | null;
  height: number | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
};

type AuthorizedSupabaseClient = Extract<
  Awaited<ReturnType<typeof authorizeVehicleImageRequest>>,
  { ok: true }
>["supabase"];

async function findImageByKey(
  supabase: AuthorizedSupabaseClient,
  tenantId: string,
  r2Key: string,
): Promise<ImageRow | null> {
  const { data } = await supabase
    .from("vehicle_images")
    .select("id, r2_key, content_type, byte_size, width, height, sort_order, is_primary, created_at")
    .eq("tenant_id", tenantId)
    .eq("r2_key", r2Key)
    .maybeSingle();
  return data;
}

function imageResponse(image: ImageRow, publicBaseUrl: string, status: number): Response {
  const publicUrl = vehicleImagePublicUrl(publicBaseUrl, image.r2_key);
  if (!publicUrl) return json({ error: "R2 public URL is not configured." }, 503);
  return json({ image: { ...image, url: publicUrl } }, status);
}

function storedMetadataMatches(
  headers: Headers,
  expectedContentType: string,
  expectedByteSize: number,
): boolean {
  const storedLength = Number(headers.get("content-length"));
  const storedType = headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return Number.isFinite(storedLength)
    && storedLength === expectedByteSize
    && storedType === expectedContentType;
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
