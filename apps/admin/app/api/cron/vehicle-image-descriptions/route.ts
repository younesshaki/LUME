import { timingSafeEqual } from "node:crypto";
import {
  claimVehicleImageDescriptionJobs,
  completeVehicleImageDescription,
  failVehicleImageDescription,
} from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { captureError } from "@/lib/observability";
import { readR2VehicleImageConfig } from "@/lib/r2Config";
import { presignR2Request } from "@/lib/r2Signing";
import {
  MAX_VISION_IMAGE_BYTES,
  describeVehicleImage,
  readVehicleImageDescriptionConfig,
} from "@/lib/vehicleImageDescriptions.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  const vision = readVehicleImageDescriptionConfig();
  const r2 = readR2VehicleImageConfig();
  if (!cronSecret || !vision || !r2) {
    return json({ error: "Vehicle image descriptions are not configured." }, 503);
  }
  if (!validBearerToken(request.headers.get("authorization"), cronSecret)) {
    return json({ error: "Unauthorized." }, 401);
  }

  const service = createServiceClient();
  let jobs: Awaited<ReturnType<typeof claimVehicleImageDescriptionJobs>>;
  try {
    jobs = await claimVehicleImageDescriptionJobs(service, 10);
  } catch (error) {
    captureError("api/cron/vehicle-image-descriptions/claim", error);
    return json({ error: "Unable to claim image descriptions." }, 500);
  }

  const results = await mapWithConcurrency(jobs, 2, async (job) => {
    try {
      if (job.byteSize > MAX_VISION_IMAGE_BYTES) {
        throw new Error("Confirmed image exceeds the vision-model input limit.");
      }
      const signed = presignR2Request({
        endpoint: r2.endpoint,
        bucket: r2.bucket,
        key: job.r2Key,
        accessKeyId: r2.accessKeyId,
        secretAccessKey: r2.secretAccessKey,
        method: "GET",
        expiresInSeconds: 60,
      });
      const imageResponse = await fetch(signed.url, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!imageResponse.ok) throw new Error(`R2 image fetch returned HTTP ${imageResponse.status}.`);
      const contentType = imageResponse.headers.get("content-type")?.split(";", 1)[0]?.trim();
      if (contentType && contentType !== job.contentType) {
        throw new Error("R2 image content type no longer matches metadata.");
      }
      const bytes = await imageResponse.arrayBuffer();
      if (bytes.byteLength !== job.byteSize || bytes.byteLength > MAX_VISION_IMAGE_BYTES) {
        throw new Error("R2 image size no longer matches metadata.");
      }
      const description = await describeVehicleImage(vision, {
        bytes,
        contentType: job.contentType,
        vehicle: job.vehicle,
      });
      const completed = await completeVehicleImageDescription(
        service,
        job,
        description,
        vision.model,
      );
      if (!completed) throw new Error("Image description lease is stale.");
      return "completed" as const;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image description failed.";
      try {
        const failure = await failVehicleImageDescription(service, job, message);
        return failure.retrying ? "retrying" as const : "dead_letter" as const;
      } catch (finishError) {
        captureError("api/cron/vehicle-image-descriptions/finish", finishError, {
          tenantId: job.tenantId,
          jobId: job.id,
        });
        return "worker_error" as const;
      }
    }
  });
  const workerErrors = results.filter((result) => result === "worker_error").length;
  return json({
    claimed: jobs.length,
    completed: results.filter((result) => result === "completed").length,
    retrying: results.filter((result) => result === "retrying").length,
    deadLetter: results.filter((result) => result === "dead_letter").length,
    workerErrors,
  }, workerErrors > 0 ? 500 : 200);
}

function validBearerToken(header: string | null, secret: string): boolean {
  const actual = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function json(payload: unknown, status: number): Response {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index]);
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(concurrency, values.length) },
    () => worker(),
  ));
  return results;
}
