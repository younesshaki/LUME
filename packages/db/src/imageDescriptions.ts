import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

type DbClient = SupabaseClient<Database, "public">;

export type ClaimedImageDescriptionJob = {
  id: string;
  tenantId: string;
  imageId: string;
  r2Key: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  attemptCount: number;
  vehicle: { year: number; make: string; model: string; trim: string | null };
};

const IMAGE_DESCRIPTION_RETRY_MS = [60_000, 5 * 60_000, 30 * 60_000] as const;

export async function enqueueVehicleImageDescription(
  client: DbClient,
  tenantId: string,
  imageId: string,
): Promise<string | null> {
  const { data, error } = await client.rpc("enqueue_vehicle_image_description", {
    p_tenant_id: tenantId,
    p_image_id: imageId,
  });
  if (error) throw new Error(`Unable to enqueue image description: ${error.message}`);
  return typeof data === "string" ? data : null;
}

export async function claimVehicleImageDescriptionJobs(
  client: DbClient,
  limit = 10,
): Promise<ClaimedImageDescriptionJob[]> {
  const { data, error } = await client.rpc("claim_vehicle_image_description_jobs", {
    p_limit: Math.min(25, Math.max(1, Math.trunc(limit))),
  });
  if (error) throw new Error(`Unable to claim image descriptions: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    imageId: row.image_id,
    r2Key: row.r2_key,
    contentType: row.content_type,
    byteSize: row.byte_size,
    attemptCount: row.attempt_count,
    vehicle: {
      year: row.vehicle_year,
      make: row.vehicle_make,
      model: row.vehicle_model,
      trim: row.vehicle_trim,
    },
  }));
}

export async function completeVehicleImageDescription(
  client: DbClient,
  job: Pick<ClaimedImageDescriptionJob, "id" | "attemptCount">,
  description: string,
  model: string,
): Promise<boolean> {
  if (!description || description.length > 12_000 || !model.trim() || model.length > 200) return false;
  const { data, error } = await client.rpc("complete_vehicle_image_description_job", {
    p_job_id: job.id,
    p_attempt_count: job.attemptCount,
    p_description: description,
    p_model: model.trim(),
  });
  if (error) throw new Error(`Unable to complete image description: ${error.message}`);
  return data === true;
}

export async function failVehicleImageDescription(
  client: DbClient,
  job: Pick<ClaimedImageDescriptionJob, "id" | "attemptCount">,
  errorMessage: string,
  nowMs = Date.now(),
): Promise<{ retrying: boolean; nextAttemptAt: string | null }> {
  const delay = IMAGE_DESCRIPTION_RETRY_MS[job.attemptCount - 1];
  const nextAttemptAt = delay === undefined ? null : new Date(nowMs + delay).toISOString();
  const { data, error } = await client.rpc("fail_vehicle_image_description_job", {
    p_job_id: job.id,
    p_attempt_count: job.attemptCount,
    p_next_attempt_at: nextAttemptAt,
    p_error: (errorMessage.trim() || "Image description failed.").slice(0, 500),
  });
  if (error || data !== true) throw new Error(`Unable to fail image description: ${error?.message ?? "stale lease"}`);
  return { retrying: nextAttemptAt !== null, nextAttemptAt };
}
