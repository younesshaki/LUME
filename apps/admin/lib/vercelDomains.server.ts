import { createVercelDomainClient } from "@lume/db";

export function configuredVercelDomainClient() {
  return createVercelDomainClient({
    token: process.env.VERCEL_ADMIN_TOKEN,
    projectId: process.env.VERCEL_PROJECT_ID,
    teamId: process.env.VERCEL_TEAM_ID,
  });
}
