import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_R2_BASE_URL = "https://pub-3a8f85adfce6494097551ac5c045b121.r2.dev";
const strictMode = process.argv.includes("--strict");

const envPath = resolve(process.cwd(), ".env.local");
const catalogPath = resolve(process.cwd(), "src/experience/products/catalog.json");

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

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const r2BaseUrl = (process.env.VITE_R2_PUBLIC_BASE_URL ?? DEFAULT_R2_BASE_URL).replace(/\/$/, "");

const appShellRequired = [
  "LUMElogo.png",
  "ChatGPT Image May 1, 2026, 09_26_21 PM.png",
];

const redBullShowcaseRequired = [
  "premiumredbull4Khandbrake3.mp4",
];

const fullLaunchAssets = [
  "showcase-entry.png",
  "showcaseentry2.png",
  "audio/showcase-ambient-loop.mp3",
  "audio/showcase-track-1.mp3",
  "audio/showcase-track-2.mp3",
  "audio/showcase-track-3.mp3",
  "audio/showcase-track-4.mp3",
  "models/hero-product.glb",
  "models/material-study.glb",
  "models/product-detail.glb",
  "video/showcase-background.mp4",
  "video/showcase-scene-2-normal.mp4",
  "video/showcase-scene-3-normal.mp4",
  "video/showcase-scene-4-normal.mp4",
  "video/showcase-scene-final-normal.mp4",
  "video/showcase-scene-2-high.mp4",
  "video/showcase-scene-3-high.mp4",
  "video/showcase-scene-4-high.mp4",
  "video/showcase-scene-final-high.mp4",
];

function addUnique(target, path, required, source) {
  if (!path) return;
  const existing = target.get(path);
  if (!existing) {
    target.set(path, { path, required, sources: [source] });
    return;
  }
  existing.required = existing.required || required;
  existing.sources.push(source);
}

const assets = new Map();

for (const path of appShellRequired) {
  addUnique(assets, path, true, "app-shell");
}

for (const path of redBullShowcaseRequired) {
  addUnique(assets, path, true, "red-bull-showcase");
}

for (const product of catalog.products) {
  addUnique(
    assets,
    product.imageKey,
    Boolean(product.imageRequired),
    `product:${product.id}`
  );
  addUnique(
    assets,
    product.preferredImageKey,
    false,
    `preferred-product-key:${product.id}`
  );
}

for (const path of fullLaunchAssets) {
  addUnique(assets, path, strictMode, "full-launch");
}

async function exists(url) {
  const head = await fetch(url, { method: "HEAD" }).catch((error) => ({ error }));
  if (!("error" in head) && head.ok) return true;

  const ranged = await fetch(url, {
    method: "GET",
    headers: { Range: "bytes=0-0" },
  }).catch((error) => ({ error }));

  return !("error" in ranged) && (ranged.ok || ranged.status === 206);
}

async function checkAsset(asset) {
  const url = `${r2BaseUrl}/${asset.path}`;
  const ok = await exists(url);
  const prefix = ok ? "ok" : asset.required ? "missing" : "optional missing";
  const sourceLabel = asset.sources.join(", ");
  console.log(`${prefix.padEnd(16)} ${asset.path} (${sourceLabel})`);
  return { ...asset, ok };
}

const results = [];

for (const asset of assets.values()) {
  results.push(await checkAsset(asset));
}

const missingRequired = results.filter((result) => result.required && !result.ok);
const missingOptional = results.filter((result) => !result.required && !result.ok);

if (missingRequired.length > 0) {
  console.error("\nMissing required R2 assets:");
  for (const result of missingRequired) {
    console.error(`- ${result.path}`);
  }
  process.exit(1);
}

console.log(`\nR2 asset check passed for ${results.filter((result) => result.required).length} required assets.`);

if (missingOptional.length > 0) {
  console.log(`${missingOptional.length} optional assets are not uploaded yet.`);
  if (!strictMode) {
    console.log("Run `npm run check:assets:strict` before launch to require full showcase media.");
  }
}
