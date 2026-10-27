import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const web = fileURLToPath(new URL("..", import.meta.url));
const keys = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "DEEPSEEK_API_KEY",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "VERCEL_TOKEN",
  "WEB_PREVIEW_SUPABASE_ANON_KEY",
  "WEB_PREVIEW_SUPABASE_SERVICE_ROLE_KEY",
];
const values = keys.flatMap((k) =>
  process.env[k] ? [Buffer.from(process.env[k])] : [],
);
function walk(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(resolve(root, e.name)) : [resolve(root, e.name)],
  );
}
let count = 0;
for (const file of [
  ...walk(resolve(web, ".next/server")),
  ...walk(resolve(web, ".next/static")),
]) {
  const data = readFileSync(file);
  count++;
  if (values.some((value) => data.includes(value)))
    throw new Error(
      "A production credential value appears in compiled web output; stop before committing",
    );
}
console.log(
  `PASS ${count} compiled server/client output files contain none of the inherited credential values`,
);
