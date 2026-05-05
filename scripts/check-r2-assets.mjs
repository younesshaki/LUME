import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_R2_BASE_URL = "https://pub-3a8f85adfce6494097551ac5c045b121.r2.dev";

const envPath = resolve(process.cwd(), ".env.local");

if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").replace(/^['"]|['"]$/g, "");
    }
  }
}

const r2BaseUrl = (process.env.VITE_R2_PUBLIC_BASE_URL ?? DEFAULT_R2_BASE_URL).replace(/\/$/, "");

const requiredAssets = [
  "LUMElogo.png",
  "blackredbullcycles.png",
  "starbucksLUME.png",
  "YSLfemmeLUME.png",
  "YSLmenLUME.png",
  "premiumredbull4Khandbrake3.mp4",
  "audio/showcase-track-1.mp3",
  "audio/showcase-track-2.mp3",
  "audio/showcase-track-3.mp3",
  "audio/showcase-track-4.mp3",
  "models/hero-product.glb",
  "models/material-study.glb",
  "models/product-detail.glb",
  "video/showcase-scene-2-normal.mp4",
  "video/showcase-scene-3-normal.mp4",
  "video/showcase-scene-4-normal.mp4",
  "video/showcase-scene-final-normal.mp4",
];

const optionalAssets = [
  "products/moet.webp",
  "products/hermes.webp",
  "products/rolex.webp",
  "video/showcase-scene-2-high.mp4",
  "video/showcase-scene-3-high.mp4",
  "video/showcase-scene-4-high.mp4",
  "video/showcase-scene-final-high.mp4",
];

async function exists(url) {
  const head = await fetch(url, { method: "HEAD" }).catch((error) => ({ error }));
  if (!("error" in head) && head.ok) return true;

  const ranged = await fetch(url, {
    method: "GET",
    headers: { Range: "bytes=0-0" },
  }).catch((error) => ({ error }));

  return !("error" in ranged) && (ranged.ok || ranged.status === 206);
}

async function checkAsset(path, required) {
  const url = `${r2BaseUrl}/${path}`;
  const ok = await exists(url);
  const prefix = ok ? "ok" : required ? "missing" : "optional missing";
  console.log(`${prefix.padEnd(16)} ${path}`);
  return { path, ok, required };
}

const results = [];

for (const path of requiredAssets) {
  results.push(await checkAsset(path, true));
}

for (const path of optionalAssets) {
  results.push(await checkAsset(path, false));
}

const missingRequired = results.filter((result) => result.required && !result.ok);

if (missingRequired.length > 0) {
  console.error("\nMissing required R2 assets:");
  for (const result of missingRequired) {
    console.error(`- ${result.path}`);
  }
  process.exit(1);
}

console.log(`\nR2 asset check passed for ${requiredAssets.length} required assets.`);
