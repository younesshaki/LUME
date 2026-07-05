import { randomBytes } from "node:crypto";
import {
  createE2EServiceClient,
  destroyE2EUser,
  loadAdminEnvLocal,
  E2E_PASSWORD_ENV,
} from "./support";

/**
 * Before the run: make sure a crashed previous run left nothing behind, and
 * mint a per-run password (never committed anywhere) that the signup test
 * reads back via process.env — globalSetup shares its env with the workers.
 */
export default async function globalSetup(): Promise<void> {
  loadAdminEnvLocal();
  const service = createE2EServiceClient();
  await destroyE2EUser(service);
  process.env[E2E_PASSWORD_ENV] = `E2e-${randomBytes(12).toString("base64url")}`;
}
