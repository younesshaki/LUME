import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

// Read-only build receipt. Does not change optimization, externals, aliases,
// chunk grouping or the runtime bundle. No environment values are recorded.
export function showcaseBuildAudit() {
  const web = fileURLToPath(new URL("..", import.meta.url));
  return {
    apply(compiler) {
      compiler.hooks.afterEmit.tap("ShowcasePocBuildReceipt", (compilation) => {
        const output = compiler.options.output.path;
        const assets = Object.keys(compilation.assets)
          .filter((name) => name.endsWith(".js"))
          .map((name) => {
            const bytes = readFileSync(resolve(output, name));
            return {
              name,
              bytes: bytes.length,
              gzipBytes: gzipSync(bytes).length,
            };
          });
        const modules = [];
        function visit(module, inherited = []) {
          const ownChunks = [
            ...compilation.chunkGraph.getModuleChunksIterable(module),
          ].flatMap((c) => [...c.files]);
          const chunks = ownChunks.length ? ownChunks : inherited;
          if (module.resource && chunks.length)
            modules.push({
              resource: relative(resolve(web, "../.."), module.resource),
              chunks,
            });
          if (module.modules)
            for (const child of module.modules) visit(child, chunks);
        }
        for (const module of compilation.modules) visit(module);
        const dir = resolve(web, ".next/analyze");
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          resolve(dir, "showcase-client.json"),
          JSON.stringify(
            {
              source: "actual production client webpack compilation",
              assets,
              modules,
            },
            null,
            2,
          ) + "\n",
        );
      });
    },
  };
}
