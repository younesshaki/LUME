import { presignR2Request } from "./r2Signing";
import type { R2VehicleImageConfig } from "./r2Config";

export async function deleteR2Object(
  config: R2VehicleImageConfig,
  r2Key: string,
): Promise<boolean> {
  try {
    const request = presignR2Request({
      endpoint: config.endpoint,
      bucket: config.bucket,
      key: r2Key,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      method: "DELETE",
      expiresInSeconds: 60,
    });
    const response = await fetch(request.url, {
      method: request.method,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}
