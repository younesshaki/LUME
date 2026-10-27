import {
  readdirSync,
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  statSync,
  realpathSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";
const web = fileURLToPath(new URL("..", import.meta.url));
const root = resolve(web, "../..");
function walk(p, ancestors = new Set()) {
  const real = realpathSync(p);
  if (ancestors.has(real))
    throw new Error("Cyclic function/source traversal; count is unverified");
  const next = new Set([...ancestors, real]);
  return readdirSync(p).flatMap((name) => {
    const path = resolve(p, name);
    return statSync(path).isDirectory()
      ? name === "_tests"
        ? []
        : walk(path, next)
      : [path];
  });
}
const sources = walk(resolve(root, "api")).filter((p) => p.endsWith(".ts"));
const handlers = sources
  .filter((p) => /export\s+default\s+/.test(readFileSync(p, "utf8")))
  .map((p) => relative(root, p));
const helpers = sources
  .filter((p) => !handlers.includes(relative(root, p)))
  .map((p) => relative(root, p));
const manifest = resolve(web, ".next/server/app-paths-manifest.json");
const prerender = resolve(web, ".next/prerender-manifest.json");
const nextRoutes = existsSync(manifest)
  ? JSON.parse(readFileSync(manifest, "utf8"))
  : null;
const staticRoutes = existsSync(prerender)
  ? Object.keys(JSON.parse(readFileSync(prerender, "utf8")).routes)
  : [];
const output = resolve(web, ".vercel/output/functions");
const deployedFunctions = existsSync(output)
  ? walk(output)
      .filter((p) => p.endsWith("/.vc-config.json"))
      .map((p) => relative(output, p))
  : null;
if (deployedFunctions?.length === 0)
  throw new Error(
    "Expected dynamic preview output is missing; function count is unverified",
  );
const report = {
  rootVite: {
    handlers,
    helpers,
    sourceHandlerCount: handlers.length,
    conservativeSourceHeadroom: 12 - sources.length,
    handlerOnlyHeadroom: 12 - handlers.length,
  },
  web: {
    nextRoutes,
    staticRoutes,
    declaredDynamicPageRoutes: ["/preview"],
    proxy: true,
    newApiHandlers: 0,
    deployedFunctions,
  },
  budget: 12,
  status: deployedFunctions
    ? "BUILD_OUTPUT_ENTRIES_AUDITED; hosted platform grouping still unverified"
    : "DEPLOYED_COUNT_UNVERIFIED: Vercel project/access not configured",
};
mkdirSync(resolve(web, "artifacts"), { recursive: true });
writeFileSync(
  resolve(web, "artifacts/function-audit.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (deployedFunctions && deployedFunctions.length > 12) process.exitCode = 1;
