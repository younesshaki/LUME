import { pathToFileURL } from "node:url";

export function shouldBuild(environment) {
  if (environment.VERCEL_FORCE_BUILD === "1") return true;
  const branch = environment.VERCEL_GIT_COMMIT_REF?.trim();
  if (!branch) return true;
  return branch === "main" || branch === "staging";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const build = shouldBuild(process.env);
  console.log(
    build
      ? "[vercel-build-policy] build allowed"
      : "[vercel-build-policy] skipped; merge the batch into staging to deploy it",
  );
  // Vercel's ignored-build command uses 1 to continue and 0 to cancel.
  process.exitCode = build ? 1 : 0;
}
