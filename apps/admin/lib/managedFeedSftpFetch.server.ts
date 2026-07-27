/**
 * Pinned, host-key-verified SFTP transport for managed inventory sources.
 *
 * This is intentionally a transport adapter only: it returns bounded bytes to
 * the existing managed feed parser/sync worker. It never accepts a host key
 * implicitly, follows no redirects, and has no directory/glob semantics.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import net from "node:net";
import { Client, type SFTPWrapper } from "ssh2";
import {
  BodyTooLargeError,
  isPublicAddress,
  readBodyBounded,
  remoteAddressesEqual,
  resolvePublicRemoteHost,
  type ValidatedRemoteAddress,
} from "./remoteImageFetch";
import { MANAGED_FEED_TIMEOUT_MS, MAX_MANAGED_FEED_BYTES } from "./managedFeedRemoteFetch.server";

const SFTP_FINGERPRINT_PATTERN = /^SHA256:([A-Za-z0-9+/]{43})$/;

export type ManagedSftpFeedConfig = {
  host: string;
  port: number;
  remotePath: string;
  hostKeyFingerprint: string;
  username: string;
  password: string;
};

type SftpFetchDependencies = {
  resolveTargets?: (host: string) => Promise<ValidatedRemoteAddress[]>;
  /** Local-test seam; production always uses the managed 20-second timeout. */
  timeoutMs?: number;
};

/** Normalizes and validates the OpenSSH SHA-256 fingerprint form. */
export function normalizeManagedSftpHostKeyFingerprint(value: string): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  // Suppliers sometimes paste OpenSSH's optional trailing base64 padding.
  const normalized = trimmed.endsWith("=") ? trimmed.slice(0, -1) : trimmed;
  return SFTP_FINGERPRINT_PATTERN.test(normalized) ? normalized : null;
}

/** Safe configuration-time validation; address validation happens at connect time. */
export function validateManagedSftpFeedConfig(value: Partial<ManagedSftpFeedConfig>):
  | { ok: true; value: Omit<ManagedSftpFeedConfig, "username" | "password"> }
  | { ok: false; error: string } {
  const host = typeof value.host === "string" ? value.host.trim().toLowerCase() : "";
  if (!host || host.length > 253 || /[\s@/?#]/.test(host)) {
    return { ok: false, error: "SFTP host must be a hostname or IP address without credentials or a path." };
  }
  const port = Number(value.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return { ok: false, error: "SFTP port must be between 1 and 65,535." };
  }
  const remotePath = typeof value.remotePath === "string" ? value.remotePath.trim() : "";
  if (!remotePath || remotePath.length > 2_048 || !remotePath.startsWith("/") || /(^|\/)\.\.?(\/|$)/.test(remotePath)) {
    return { ok: false, error: "SFTP remote path must be an absolute file path without dot segments." };
  }
  if (/[\u0000\r\n]/.test(remotePath)) {
    return { ok: false, error: "SFTP remote path contains invalid characters." };
  }
  const hostKeyFingerprint = normalizeManagedSftpHostKeyFingerprint(value.hostKeyFingerprint ?? "");
  if (!hostKeyFingerprint) {
    return { ok: false, error: "Enter the supplier’s OpenSSH SHA256 host-key fingerprint (SHA256:…)." };
  }
  return { ok: true, value: { host, port, remotePath, hostKeyFingerprint } };
}

/** SHA-256 fingerprint in OpenSSH's visible format, without trailing padding. */
export function managedSftpHostKeyFingerprint(key: Buffer): string {
  return `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
}

/**
 * Download exactly one SFTP file under the same 25 MiB/20-second bounds as
 * HTTPS feeds. Every DNS record must be public; the TCP socket uses the
 * validated literal address rather than a second hostname lookup.
 */
export async function fetchManagedSftpFeed(
  input: ManagedSftpFeedConfig,
  dependencies: SftpFetchDependencies = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const config = validateManagedSftpFeedConfig(input);
  if (!config.ok) throw new Error(config.error);
  if (!isCredentialValue(input.username) || !isCredentialValue(input.password)) {
    throw new Error("SFTP username and password are required.");
  }

  const usesProductionResolver = !dependencies.resolveTargets;
  const resolveTargets = dependencies.resolveTargets ?? ((host: string) => resolvePublicRemoteHost(host));
  const timeoutMs = dependencies.timeoutMs ?? MANAGED_FEED_TIMEOUT_MS;
  const targets = await resolveTargets(config.value.host);
  // Custom resolvers are a local-test seam, analogous to the image transport
  // tests that construct a local pinned target directly. Production always
  // uses resolvePublicRemoteHost(), which rejects every private result.
  if (targets.length === 0 || (usesProductionResolver && targets.some((target) => !isPublicAddress(target.address)))) {
    throw new Error("SFTP host is not publicly reachable.");
  }

  let lastError: unknown;
  for (const target of targets) {
    try {
      return await fetchFromPinnedSftpTarget(
        { ...config.value, username: input.username, password: input.password },
        target,
        timeoutMs,
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(safeSftpError(lastError));
}

async function fetchFromPinnedSftpTarget(
  config: ManagedSftpFeedConfig,
  target: ValidatedRemoteAddress,
  timeoutMs: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const connection = await openPinnedSftpConnection(config, target, timeoutMs);
  try {
    const stream = connection.sftp.createReadStream(config.remotePath);
    try {
      return await readSftpStreamBounded(stream as unknown as AsyncIterable<Uint8Array> & { destroy: () => void }, connection.client, timeoutMs);
    } finally {
      stream.destroy();
    }
  } finally {
    connection.client.end();
  }
}

async function openPinnedSftpConnection(
  config: ManagedSftpFeedConfig,
  target: ValidatedRemoteAddress,
  timeoutMs: number,
): Promise<{ client: Client; socket: net.Socket; sftp: SFTPWrapper }> {
  const client = new Client();
  const socket = new net.Socket();
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      client.destroy();
      socket.destroy();
      reject(error);
    };
    const timeout = setTimeout(() => fail(new Error("SFTP feed request timed out.")), timeoutMs);
    socket.once("error", (error) => fail(new Error(`SFTP connection failed: ${error.message}`)));
    client.once("error", (error) => fail(new Error(`SFTP connection failed: ${error.message}`)));
    socket.once("connect", () => {
      const connectedAddress = socket.remoteAddress;
      if (!connectedAddress || !remoteAddressesEqual(connectedAddress, target.address)) {
        fail(new Error("SFTP connected address does not match the validated address."));
        return;
      }
      client.once("ready", () => {
        client.sftp((error, sftp) => {
          if (error || !sftp) {
            fail(new Error("SFTP subsystem could not be opened."));
            return;
          }
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve({ client, socket, sftp });
        });
      });
      client.connect({
        sock: socket,
        username: config.username,
        password: config.password,
        tryKeyboard: false,
        readyTimeout: timeoutMs,
        // ssh2 otherwise accepts every host key. Verify raw key material so
        // we use the standard OpenSSH SHA-256 display fingerprint.
        hostVerifier: (key: Buffer) => fingerprintsEqual(
          managedSftpHostKeyFingerprint(key),
          config.hostKeyFingerprint,
        ),
      });
    });
    // A numeric, prevalidated address prevents a DNS rebind between policy
    // validation and the actual socket connection.
    socket.connect({ host: target.address, port: config.port, family: target.family });
  });
}

function readSftpStreamBounded(
  stream: AsyncIterable<Uint8Array> & { destroy: () => void; on?: (event: "error", listener: () => void) => unknown },
  client: Client,
  timeoutMs: number,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    // Avoid an unhandled stream error after the timeout path tears down SSH.
    stream.on?.("error", () => undefined);
    const timeout = setTimeout(() => {
      stream.destroy();
      client.destroy();
      finish(() => reject(new Error("SFTP feed request timed out.")));
    }, timeoutMs);
    readBodyBounded(stream, MAX_MANAGED_FEED_BYTES)
      .then((bytes) => finish(() => resolve(bytes)))
      .catch((error) => finish(() => reject(error)));
  });
}

function fingerprintsEqual(actual: string, expected: string): boolean {
  const normalizedExpected = normalizeManagedSftpHostKeyFingerprint(expected);
  if (!normalizedExpected || actual.length !== normalizedExpected.length) return false;
  return timingSafeEqual(Buffer.from(actual, "utf8"), Buffer.from(normalizedExpected, "utf8"));
}

function isCredentialValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 2_000 && !/[\u0000\r\n]/.test(value);
}

function safeSftpError(error: unknown): string {
  if (error instanceof BodyTooLargeError) return "SFTP feed exceeds the 25 MB limit.";
  const message = error instanceof Error ? error.message : "SFTP feed request failed.";
  if (/host key|hostVerifier|verification failed|host denied/i.test(message)) {
    return "SFTP host key changed or does not match the configured fingerprint. Verify it with the supplier before updating this source.";
  }
  if (/authentication|all configured authentication/i.test(message)) return "SFTP authentication failed.";
  return message.replace(/(?:sftp|ssh):\/\/\S+/gi, "[endpoint]").slice(0, 500);
}
