import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, relative, dirname, extname } from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const appRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceRoots = ["app", "server", "components", "config"];
function files(root) {
  return readdirSync(root).flatMap((name) => {
    const p = resolve(root, name);
    return statSync(p).isDirectory()
      ? files(p)
      : /\.(tsx?|mjs)$/.test(p)
        ? [p]
        : [];
  });
}
export function inspectBoundaries(root = appRoot) {
  root = resolve(root);
  const paths = sourceRoots.flatMap((folder) => files(resolve(root, folder)));
  for (const entry of ["proxy.ts", "next.config.mjs"])
    if (existsSync(resolve(root, entry))) paths.push(resolve(root, entry));
  const graph = new Map();
  const errors = [];
  for (const file of paths) {
    const text = readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const client = ast.statements.some(
      (s) =>
        ts.isExpressionStatement(s) &&
        ts.isStringLiteral(s.expression) &&
        s.expression.text === "use client",
    );
    const node = { client, imports: [], file };
    graph.set(file, node);
    function visit(s) {
      if (
        (ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) &&
        s.moduleSpecifier &&
        ts.isStringLiteral(s.moduleSpecifier)
      ) {
        const typeOnly =
          (ts.isImportDeclaration(s) && s.importClause?.isTypeOnly) ||
          (ts.isExportDeclaration(s) && s.isTypeOnly);
        node.imports.push({ specifier: s.moduleSpecifier.text, typeOnly });
      }
      if (
        ts.isCallExpression(s) &&
        (s.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(s.expression) && s.expression.text === "require"))
      ) {
        if (!s.arguments[0] || !ts.isStringLiteral(s.arguments[0]))
          errors.push(
            `${relative(root, file)}: nonliteral module loading is forbidden`,
          );
        else
          node.imports.push({
            specifier: s.arguments[0].text,
            typeOnly: false,
          });
      }
      if (client && ts.isIdentifier(s) && s.text === "process")
        errors.push(
          `${relative(root, file)}: client process access is forbidden in Phase 1`,
        );
      if (
        file.startsWith(resolve(root, "server") + "/") &&
        ts.isIdentifier(s) &&
        ["window", "document", "localStorage", "sessionStorage"].includes(
          s.text,
        )
      )
        errors.push(
          `${relative(root, file)}: browser globals are forbidden in server modules`,
        );
      ts.forEachChild(s, visit);
    }
    visit(ast);
  }
  for (const node of graph.values()) {
    node.edges = [];
    for (const { specifier, typeOnly } of node.imports) {
      if (specifier === "@lume/types" && typeOnly) continue;
      if (specifier.startsWith(".")) {
        const base = resolve(dirname(node.file), specifier);
        if (!base.startsWith(root + "/")) {
          errors.push(
            `${relative(root, node.file)}: import escapes web workspace`,
          );
          continue;
        }
        const target = [
          base,
          base + ".ts",
          base + ".tsx",
          base + ".mjs",
          resolve(base, "index.ts"),
          resolve(base, "index.tsx"),
        ].find((p) => graph.has(p));
        if (!target && extname(base) !== ".css")
          errors.push(
            `${relative(root, node.file)}: unresolved local import ${specifier}`,
          );
        if (target && !typeOnly) node.edges.push(target);
      } else if (
        !(specifier.startsWith("node:") && !node.client) &&
        !["server-only", "react", "next"].some(
          (p) => specifier === p || specifier.startsWith(p + "/"),
        )
      ) {
        errors.push(
          `${relative(root, node.file)}: unapproved runtime package ${specifier}`,
        );
      }
    }
    if (
      node.file.startsWith(resolve(root, "server") + "/") ||
      ["proxy.ts", "next.config.mjs"].includes(relative(root, node.file))
    ) {
      const seen = new Set();
      const walk = (n) => {
        if (seen.has(n.file)) return;
        seen.add(n.file);
        if (n.client)
          errors.push(
            `${relative(root, node.file)}: server graph reaches a client component`,
          );
        for (const p of n.edges ?? []) walk(graph.get(p));
      };
      // Run after all edges have been resolved below.
      node.checkServer = walk;
    }
  }
  for (const node of graph.values()) {
    node.checkServer?.(node);
    if (node.client) {
      const seen = new Set();
      const walk = (n) => {
        if (seen.has(n.file)) return;
        seen.add(n.file);
        if (
          n.file.startsWith(resolve(root, "server") + "/") ||
          n.file.startsWith(resolve(root, "config") + "/")
        )
          errors.push(
            `${relative(root, node.file)}: client graph reaches server/config code`,
          );
        if (n.imports.some((i) => i.specifier === "server-only"))
          errors.push(
            `${relative(root, node.file)}: client graph reaches server-only`,
          );
        if (
          n.imports.some(
            (i) =>
              !i.typeOnly &&
              ["next/headers", "next/server", "next/cache"].includes(
                i.specifier,
              ),
          )
        )
          errors.push(
            `${relative(root, node.file)}: client graph reaches a server-only Next API`,
          );
        for (const p of n.edges ?? []) walk(graph.get(p));
      };
      walk(node);
    }
  }
  return [...new Set(errors)];
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const errors = inspectBoundaries();
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else
    console.log(
      "PASS web import boundaries: no cross-workspace runtime imports or client/server graph leaks",
    );
}
