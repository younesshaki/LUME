export type R2VehicleImageConfig = {
  endpoint: string;
  bucket: string;
  publicBaseUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
};

type R2VehicleImageEnvironment = Partial<Record<
  | "NODE_ENV"
  | "R2_ENDPOINT"
  | "R2_BUCKET_NAME"
  | "R2_PUBLIC_BASE_URL"
  | "R2_ACCESS_KEY_ID"
  | "R2_SECRET_ACCESS_KEY",
  string
>>;

export function readR2VehicleImageConfig(
  environment: R2VehicleImageEnvironment = process.env,
): R2VehicleImageConfig | null {
  const endpoint = environment.R2_ENDPOINT?.replace(/\/$/, "");
  const bucket = environment.R2_BUCKET_NAME?.trim();
  const publicBaseUrl = readR2PublicBaseUrl(environment);
  const accessKeyId = environment.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = environment.R2_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !publicBaseUrl || !accessKeyId || !secretAccessKey) return null;
  try {
    const endpointUrl = new URL(endpoint);
    const publicUrl = new URL(publicBaseUrl);
    if (
      endpointUrl.protocol !== "https:" ||
      endpointUrl.pathname !== "/" ||
      endpointUrl.username ||
      endpointUrl.password ||
      endpointUrl.search ||
      endpointUrl.hash ||
      !isHttpProtocol(publicUrl.protocol, environment.NODE_ENV) ||
      publicUrl.username ||
      publicUrl.password
    ) return null;
  } catch {
    return null;
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/i.test(bucket)) return null;
  return { endpoint, bucket, publicBaseUrl, accessKeyId, secretAccessKey };
}

export function readR2PublicBaseUrl(
  environment: R2VehicleImageEnvironment = process.env,
): string | null {
  const value = environment.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!isHttpProtocol(url.protocol, environment.NODE_ENV) || url.username || url.password) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function isHttpProtocol(protocol: string, nodeEnv: string | undefined): boolean {
  return protocol === "https:" || (nodeEnv !== "production" && protocol === "http:");
}
