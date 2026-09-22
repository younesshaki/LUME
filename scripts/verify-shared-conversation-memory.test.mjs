// @vitest-environment node
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const script = resolve(process.cwd(), "scripts/verify-shared-conversation-memory.mjs");

/**
 * The harness writes to a real Redis, so its refusals ARE its safety case.
 * These run it as a subprocess with hostile-ish environments and assert it
 * declines — a guard that can be removed without a test failing is not a guard.
 */
async function attempt(env) {
  try {
    const { stdout, stderr } = await run(process.execPath, [script], {
      env: { ...process.env, ...env },
      timeout: 20_000,
    });
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    return {
      code: error.code ?? 1,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

const withoutAmbientCredentials = {
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  VERIFY_SHARED_MEMORY: "",
  VERIFY_UPSTASH_REDIS_REST_URL: "",
  VERIFY_UPSTASH_REDIS_REST_TOKEN: "",
};

describe("shared-memory harness refuses unsafe invocations", () => {
  it("does nothing without an explicit opt-in", async () => {
    const { code, output } = await attempt(withoutAmbientCredentials);
    expect(code).not.toBe(0);
    expect(output).toContain("VERIFY_SHARED_MEMORY=1");
  });

  it("refuses when opted in but given no credentials", async () => {
    const { code, output } = await attempt({
      ...withoutAmbientCredentials,
      VERIFY_SHARED_MEMORY: "1",
    });
    expect(code).not.toBe(0);
    expect(output).toContain("VERIFY_UPSTASH_REDIS_REST_URL");
  });

  it("refuses the ambient UPSTASH_* pair, so an exported production credential cannot be used by accident", async () => {
    // The whole reason the harness reads VERIFY_-prefixed variables.
    const { code, output } = await attempt({
      ...withoutAmbientCredentials,
      VERIFY_SHARED_MEMORY: "1",
      UPSTASH_REDIS_REST_URL: "https://live.example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "live-token",
    });
    expect(code).not.toBe(0);
    expect(output).toContain("VERIFY_UPSTASH_REDIS_REST_URL");
  });

  it("refuses when pointed at the instance this environment already uses", async () => {
    const { code, output } = await attempt({
      ...withoutAmbientCredentials,
      VERIFY_SHARED_MEMORY: "1",
      UPSTASH_REDIS_REST_URL: "https://live.example.upstash.io",
      VERIFY_UPSTASH_REDIS_REST_URL: "https://live.example.upstash.io",
      VERIFY_UPSTASH_REDIS_REST_TOKEN: "t",
    });
    expect(code).not.toBe(0);
    expect(output).toContain("disposable preview instance");
  });

  it("never prints a supplied credential", async () => {
    const { output } = await attempt({
      ...withoutAmbientCredentials,
      VERIFY_SHARED_MEMORY: "1",
      VERIFY_UPSTASH_REDIS_REST_URL: "https://super-secret-host.upstash.io",
      VERIFY_UPSTASH_REDIS_REST_TOKEN: "super-secret-token",
    });
    expect(output).not.toContain("super-secret-token");
  });
});

describe("shared-memory harness cannot touch a broad keyspace", () => {
  const source = readFileSync(script, "utf8");

  it("issues no pattern-based or flush command", () => {
    // A cleanup that scans is a cleanup that can delete someone else's data.
    for (const forbidden of ["SCAN", "KEYS", "FLUSHDB", "FLUSHALL", "DEL *"]) {
      expect(source).not.toContain(`"${forbidden}"`);
    }
  });

  it("deletes only names it recorded while creating them", () => {
    expect(source).toContain("for (const name of created)");
    expect(source).toContain('command(["DEL", name])');
  });

  it("scopes every key under one run-specific prefix", () => {
    expect(source).toContain("randomUUID()");
    expect(source).toContain("lume:verify:shared-memory:");
  });
});
