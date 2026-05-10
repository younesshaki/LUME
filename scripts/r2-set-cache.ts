import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  S3Client,
  CopyObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

function loadEnvLocal(): Record<string, string> {
  const path = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(path, "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const env = { ...loadEnvLocal(), ...process.env };

const required = ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET_NAME"] as const;
for (const k of required) {
  if (!env[k]) {
    console.error(`Missing ${k} in .env.local`);
    process.exit(1);
  }
}

const OBJECT_KEY = process.argv[2] ?? "vehicles-with-generated-images.csv";
const CACHE_CONTROL = process.argv[3] ?? "public, max-age=86400";

const client = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
  },
});

async function main() {
  const bucket = env.R2_BUCKET_NAME!;

  const before = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: OBJECT_KEY }),
  );
  console.log(`Before: ContentType=${before.ContentType} CacheControl=${before.CacheControl ?? "(none)"} Size=${before.ContentLength}`);

  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: OBJECT_KEY,
      CopySource: `/${bucket}/${encodeURIComponent(OBJECT_KEY)}`,
      MetadataDirective: "REPLACE",
      CacheControl: CACHE_CONTROL,
      ContentType: before.ContentType ?? "text/csv",
    }),
  );

  const after = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: OBJECT_KEY }),
  );
  console.log(`After:  ContentType=${after.ContentType} CacheControl=${after.CacheControl ?? "(none)"} Size=${after.ContentLength}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
