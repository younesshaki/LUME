import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../../..", import.meta.url));
function walk(p) {
  return readdirSync(p, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(resolve(p, e.name))
      : /\.(ts|tsx|css|glsl)$/.test(e.name)
        ? [resolve(p, e.name)]
        : [],
  );
}
const source = [
  ...walk(resolve(root, "src")),
  resolve(root, "vite.config.ts"),
  resolve(root, "index.html"),
]
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");
const names = [...new Set(source.match(/VITE_[A-Z0-9_]+/g))].sort();
const mappings = JSON.parse(
  readFileSync(new URL("../config/env-mapping.json", import.meta.url), "utf8"),
);
assert.deepEqual(
  names,
  Object.keys(mappings).sort(),
  "Every current VITE setting must have an explicit mapping",
);
console.log(
  `PASS complete environment mapping: ${names.length} current VITE names; no credential values read`,
);
console.log(
  "| Vite | Next semantic target | Preview disposition |\n|---|---|---|",
);
for (const name of names)
  console.log(`| \`${name}\` | ${mappings[name][0]} | ${mappings[name][1]} |`);
