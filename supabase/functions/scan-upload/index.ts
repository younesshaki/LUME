import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { antivirusDecision, tenantIdFromObjectKey } from "../_shared/antivirusPolicy.ts";

type StorageWebhook = {
  type?: string;
  record?: {
    bucket_id?: string;
    name?: string;
    metadata?: Record<string, unknown> | null;
  } | null;
};

type ScanResponse = { clean: boolean; signature: string | null };
type ServiceClient = SupabaseClient;

const MAX_SCAN_BYTES = 25 * 1024 * 1024;

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const expectedSecret = Deno.env.get("ANTIVIRUS_WEBHOOK_SECRET") ?? "";
  const actualSecret = request.headers.get("x-lume-antivirus-secret") ?? "";
  if (!expectedSecret || !constantTimeEqual(actualSecret, expectedSecret)) {
    return json({ error: "Unauthorized." }, 401);
  }

  let payload: StorageWebhook;
  try {
    payload = await request.json() as StorageWebhook;
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  const bucket = payload.record?.bucket_id?.trim() ?? "";
  const objectKey = payload.record?.name?.trim() ?? "";
  const tenantId = tenantIdFromObjectKey(objectKey);
  if (payload.type !== "INSERT" || !bucket || !objectKey || !tenantId) {
    return json({ error: "Unsupported storage event." }, 400);
  }
  const metadata = payload.record?.metadata ?? {};
  const contentType = typeof metadata.mimetype === "string" ? metadata.mimetype : null;
  const byteSize = finiteNonnegativeInteger(metadata.size);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Storage scanner is not configured." }, 503);
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const scanId = await upsertScan(supabase, {
    tenant_id: tenantId,
    bucket_id: bucket,
    object_key: objectKey,
    content_type: contentType,
    byte_size: byteSize,
    status: "pending",
    scanner: null,
    signature: null,
    quarantine_key: null,
    scanned_at: null,
  });
  if (!scanId) return json({ error: "Unable to create scan record." }, 500);

  if (antivirusDecision(bucket, contentType) === "skip") {
    await updateScan(supabase, scanId, { status: "skipped", scanned_at: new Date().toISOString() });
    return json({ status: "skipped" }, 202);
  }

  const scannerUrl = Deno.env.get("CLAMAV_SCAN_URL")?.trim();
  if (!scannerUrl) {
    await updateScan(supabase, scanId, {
      status: "unavailable",
      scanner: "clamav",
      scanned_at: new Date().toISOString(),
    });
    return json({ status: "unavailable" }, 202);
  }
  if (byteSize !== null && byteSize > MAX_SCAN_BYTES) {
    await updateScan(supabase, scanId, { status: "error", scanner: "clamav" });
    return json({ error: "Object exceeds scanner size limit." }, 413);
  }

  try {
    const { data: file, error: downloadError } = await supabase.storage.from(bucket).download(objectKey);
    if (downloadError || !file) throw new Error(downloadError?.message ?? "download failed");
    if (file.size > MAX_SCAN_BYTES) throw new Error("object exceeds scanner size limit");
    const bytes = await file.arrayBuffer();
    const scan = await callScanner(scannerUrl, bytes, objectKey);
    if (scan.clean) {
      await updateScan(supabase, scanId, {
        status: "clean",
        scanner: "clamav",
        signature: null,
        scanned_at: new Date().toISOString(),
      });
      return json({ status: "clean" }, 200);
    }

    const quarantineKey = `${tenantId}/${scanId}-${safeLeafName(objectKey)}`;
    const upload = await supabase.storage.from("tenant-quarantine").upload(
      quarantineKey,
      bytes,
      { contentType: "application/octet-stream", upsert: true },
    );
    if (upload.error) throw new Error(`quarantine upload failed: ${upload.error.message}`);
    const removal = await supabase.storage.from(bucket).remove([objectKey]);
    if (removal.error) throw new Error(`source removal failed: ${removal.error.message}`);
    await updateScan(supabase, scanId, {
      status: "infected",
      scanner: "clamav",
      signature: scan.signature,
      quarantine_key: quarantineKey,
      scanned_at: new Date().toISOString(),
    });
    await supabase.from("admin_notifications").insert({
      tenant_id: tenantId,
      type: "storage.quota_warning",
      body: `A potentially infected upload was removed and quarantined: ${safeLeafName(objectKey)}`,
      link: null,
      dedupe_key: `malware:${scanId}`,
    });
    return json({ status: "infected" }, 200);
  } catch (error) {
    await updateScan(supabase, scanId, {
      status: "error",
      scanner: "clamav",
      scanned_at: new Date().toISOString(),
    });
    console.error(JSON.stringify({
      scope: "scan-upload",
      scanId,
      message: error instanceof Error ? error.message.slice(0, 500) : "scan failed",
    }));
    return json({ error: "Upload scan failed." }, 502);
  }
});

async function callScanner(url: string, bytes: ArrayBuffer, objectKey: string): Promise<ScanResponse> {
  const token = Deno.env.get("CLAMAV_SCAN_TOKEN")?.trim();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Upload-Name": safeLeafName(objectKey),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: bytes,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`scanner returned ${response.status}`);
  const value = await response.json() as unknown;
  if (!isRecord(value) || typeof value.clean !== "boolean") {
    throw new Error("scanner returned an invalid response");
  }
  return {
    clean: value.clean,
    signature: typeof value.signature === "string" ? value.signature.slice(0, 500) : null,
  };
}

async function upsertScan(client: ServiceClient, row: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await client.from("tenant_asset_scans").upsert(row, {
    onConflict: "bucket_id,object_key",
  }).select("id").single();
  return error ? null : typeof data?.id === "string" ? data.id : null;
}

async function updateScan(
  client: ServiceClient,
  id: string,
  update: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.from("tenant_asset_scans").update(update).eq("id", id);
  if (error) throw new Error(`Unable to update scan record: ${error.message}`);
}

function finiteNonnegativeInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function safeLeafName(value: string): string {
  return (value.split("/").pop() ?? "upload")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 180) || "upload";
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(payload: unknown, status: number): Response {
  return Response.json(payload, {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
