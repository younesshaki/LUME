import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { Server, utils } from "ssh2";
import {
  fetchManagedSftpFeed,
  managedSftpHostKeyFingerprint,
  normalizeManagedSftpHostKeyFingerprint,
} from "./managedFeedSftpFetch.server";

const USERNAME = "supplier";
const PASSWORD = "correct-horse-battery-staple";
const REMOTE_PATH = "/exports/inventory.csv";

describe("managed SFTP feed transport", () => {
  let server: Server;
  let port: number;
  let fingerprint: string;
  let content = Buffer.from("Stock,VIN\nOW26220,4T1DAACK4TU663212\n", "utf8");
  let stallReads = false;

  beforeAll(async () => {
    const keyPair = utils.generateKeyPairSync("rsa", { bits: 2048 });
    const parsedKey = utils.parseKey(keyPair.private);
    if (parsedKey instanceof Error) throw parsedKey;
    fingerprint = managedSftpHostKeyFingerprint(parsedKey.getPublicSSH());
    server = new Server({ hostKeys: [keyPair.private] }, (client) => {
      // A rejected host key/password intentionally closes the test connection.
      client.on("error", () => undefined);
      client.on("authentication", (context) => {
        if (context.method === "password" && context.username === USERNAME && context.password === PASSWORD) {
          context.accept();
        } else {
          context.reject();
        }
      }).on("ready", () => {
        client.on("session", (accept) => {
          const session = accept();
          session.on("sftp", (acceptSftp) => {
            const sftp = acceptSftp();
            const handles = new Set<number>();
            let nextHandle = 1;
            sftp.on("OPEN", (requestId, filename, flags) => {
              if (filename !== REMOTE_PATH || !(flags & 0x00000001)) {
                sftp.status(requestId, 4);
                return;
              }
              const index = nextHandle++;
              const handle = Buffer.alloc(4);
              handle.writeUInt32BE(index, 0);
              handles.add(index);
              sftp.handle(requestId, handle);
            }).on("READ", (requestId, handle, offset, length) => {
              const index = handle.length === 4 ? handle.readUInt32BE(0) : -1;
              if (!handles.has(index)) {
                sftp.status(requestId, 4);
                return;
              }
              if (offset >= content.length) {
                sftp.status(requestId, 1);
                return;
              }
              if (stallReads) return;
              sftp.data(requestId, content.subarray(offset, Math.min(offset + length, content.length)));
            }).on("CLOSE", (requestId, handle) => {
              if (handle.length === 4) handles.delete(handle.readUInt32BE(0));
              sftp.status(requestId, 0);
            });
          });
        });
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const localResolver = async () => [{
    hostname: "sftp.supplier.example",
    address: "127.0.0.1",
    family: 4,
  }];

  const input = (overrides: Partial<Parameters<typeof fetchManagedSftpFeed>[0]> = {}) => ({
    host: "sftp.supplier.example",
    port,
    remotePath: REMOTE_PATH,
    hostKeyFingerprint: fingerprint,
    username: USERNAME,
    password: PASSWORD,
    ...overrides,
  });

  it("downloads a host-key-verified file from a pinned local SFTP server", async () => {
    const bytes = await fetchManagedSftpFeed(input(), { resolveTargets: localResolver });
    expect(new TextDecoder().decode(bytes)).toBe(content.toString("utf8"));
  });

  it("rejects a host key that does not match the admin-supplied fingerprint", async () => {
    await expect(fetchManagedSftpFeed(input({ hostKeyFingerprint: `SHA256:${"A".repeat(43)}` }), {
      resolveTargets: localResolver,
    })).rejects.toThrow(/host key changed|does not match/i);
  });

  it("rejects loopback addresses before opening an SFTP connection", async () => {
    await expect(fetchManagedSftpFeed(input({ host: "127.0.0.1" })))
      .rejects.toThrow(/not publicly reachable/i);
  });

  it("rejects invalid SFTP credentials", async () => {
    await expect(fetchManagedSftpFeed(input({ password: "wrong-password" }), {
      resolveTargets: localResolver,
    })).rejects.toThrow(/authentication failed/i);
  });

  it("stops reading an oversized SFTP file at the managed feed cap", async () => {
    content = Buffer.alloc(25 * 1024 * 1024 + 1, 0x61);
    await expect(fetchManagedSftpFeed(input(), { resolveTargets: localResolver }))
      .rejects.toThrow(/exceeds the 25 MB limit/i);
    content = Buffer.from("Stock,VIN\nOW26220,4T1DAACK4TU663212\n", "utf8");
  });

  it("enforces the managed feed timeout while reading", async () => {
    stallReads = true;
    try {
      await expect(fetchManagedSftpFeed(input(), { resolveTargets: localResolver, timeoutMs: 100 }))
        .rejects.toThrow(/timed out/i);
    } finally {
      stallReads = false;
    }
  });

  it("normalizes only valid OpenSSH SHA-256 fingerprints", () => {
    expect(normalizeManagedSftpHostKeyFingerprint(`${fingerprint}=`)).toBe(fingerprint);
    expect(normalizeManagedSftpHostKeyFingerprint("md5:00:11")).toBeNull();
  });
});
