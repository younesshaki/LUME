import { createE2EServiceClient, destroyE2EUser, loadAdminEnvLocal } from "./support";

/** After the run: remove the throwaway user and its provisioned tenant(s). */
export default async function globalTeardown(): Promise<void> {
  loadAdminEnvLocal();
  const service = createE2EServiceClient();
  await destroyE2EUser(service);
}
