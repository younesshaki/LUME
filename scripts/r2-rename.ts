import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { S3Client, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

const env = { ...loadEnvLocal(), ...process.env };
const bucket = env.R2_BUCKET_NAME!;
const client = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
});

const RENAMES: Array<{ from: string; to: string }> = [
  {
    from: "vehicle images/ChatGPT Image May 11, 2026, 01_17_03 AM.png",
    to:   "vehicle images/vehicle-special-1.webp",
  },
  {
    from: "vehicle images/ChatGPT Image May 11, 2026, 01_24_36 AM.png",
    to:   "vehicle images/vehicle-special-2.webp",
  },
];

async function main() {
  for (const { from, to } of RENAMES) {
    console.log(`Renaming: "${from}" → "${to}"`);
    await client.send(new CopyObjectCommand({
      Bucket: bucket,
      Key: to,
      CopySource: `/${bucket}/${encodeURIComponent(from)}`,
      MetadataDirective: "COPY",
      CacheControl: "public, max-age=86400",
    }));
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: from }));
    console.log(`  Done.`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
