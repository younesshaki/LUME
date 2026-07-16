import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const migrationDirectory = fileURLToPath(new URL("../supabase/migrations", import.meta.url));

export function validateMigrationNames(fileNames) {
  const errors = [];
  const migrations = fileNames
    .filter((name) => name.endsWith(".sql"))
    .map((name) => {
      const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(name);
      if (!match) {
        errors.push(`Invalid migration filename: ${name}`);
        return null;
      }
      return { name, number: Number(match[1]) };
    })
    .filter(Boolean)
    .sort((left, right) => left.number - right.number);

  for (let index = 0; index < migrations.length; index += 1) {
    const expected = index + 1;
    const migration = migrations[index];
    if (migration.number !== expected) {
      errors.push(
        `Expected migration ${String(expected).padStart(3, "0")}, found ${migration.name}`,
      );
    }
  }
  return errors;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const files = await readdir(migrationDirectory);
  const errors = validateMigrationNames(files);
  if (errors.length > 0) {
    console.error(`[migrations] ${errors.join("; ")}`);
    process.exitCode = 1;
  } else {
    console.log(`[migrations] ${files.filter((name) => name.endsWith(".sql")).length} sequential files`);
  }
}
