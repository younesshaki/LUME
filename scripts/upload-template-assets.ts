/**
 * Upload a folder of template images to R2 under a prefix — idempotent: an
 * object whose size and type already match is skipped, anything else is
 * (re)written. Used for Template Glo3D's stock photography (see
 * docs/template-glo3d-sources.md for every photo's source and licence).
 *
 *   npx tsx scripts/upload-template-assets.ts <local-dir> <r2-prefix> [--env <file>] [--dry-run]
 *   e.g. npx tsx scripts/upload-template-assets.ts ./out templates/glo3d --env apps/admin/.env.local
 *
 * Credentials come from the environment or the --env file (R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME). They are never printed.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".avif": "image/avif",
};

function readEnvFile(path: string | undefined): Record<string, string> {
  if (!path) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(resolve(path), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = value;
  }
  return out;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const [localDir, prefixArg] = process.argv.slice(2).filter((value, index, all) => !value.startsWith("--") && all[index - 1] !== "--env");
if (!localDir || !prefixArg) {
  console.error("Usage: upload-template-assets.ts <local-dir> <r2-prefix> [--env <file>] [--dry-run]");
  process.exit(1);
}
const prefix = prefixArg.replace(/^\/+|\/+$/g, "");
const dryRun = process.argv.includes("--dry-run");
const env = { ...readEnvFile(arg("--env")), ...process.env };
for (const key of ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET_NAME"] as const) {
  if (!env[key]) {
    console.error(`Missing ${key} (set it in the environment or pass --env <file>)`);
    process.exit(1);
  }
}

const client = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
});

const files = readdirSync(localDir).filter((name) => CONTENT_TYPES[extname(name).toLowerCase()]).sort();
let uploaded = 0;
let skipped = 0;
for (const name of files) {
  const path = join(localDir, name);
  const key = `${prefix}/${name}`;
  const contentType = CONTENT_TYPES[extname(name).toLowerCase()];
  const size = statSync(path).size;
  const existing = await client
    .send(new HeadObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }))
    .catch(() => null);
  if (existing && existing.ContentLength === size && existing.ContentType === contentType) {
    skipped += 1;
    console.log(`skip   ${key} (unchanged)`);
    continue;
  }
  if (dryRun) {
    console.log(`would  ${key} (${size} bytes)`);
    continue;
  }
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: readFileSync(path),
      ContentType: contentType,
      // Stable template keys: cache for a week, not forever, so a replaced
      // photo propagates.
      CacheControl: "public, max-age=604800",
    }),
  );
  uploaded += 1;
  console.log(`upload ${key} (${size} bytes)`);
}
console.log(`done: ${uploaded} uploaded, ${skipped} unchanged${dryRun ? " (dry run)" : ""}`);
