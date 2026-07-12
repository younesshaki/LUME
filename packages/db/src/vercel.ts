export type VercelVerificationChallenge = {
  type: string;
  domain: string;
  value: string;
  reason: string | null;
};

export type VercelDomainSnapshot = {
  status: "configured";
  name: string;
  apexName: string | null;
  projectId: string;
  verified: boolean;
  verification: VercelVerificationChallenge[];
  misconfigured: boolean | null;
  configuredBy: string | null;
  recommendedIpv4: string[];
  recommendedCname: string[];
  checkedAt: string;
};

export type VercelDomainOperation =
  | VercelDomainSnapshot
  | { status: "not_configured" };

export type VercelDomainClient = {
  addDomain(domain: string): Promise<VercelDomainOperation>;
  getDomain(domain: string): Promise<VercelDomainOperation>;
  verifyDomain(domain: string): Promise<VercelDomainOperation>;
  removeDomain(domain: string): Promise<{ status: "removed" | "not_configured" }>;
};

export type VercelDomainClientOptions = {
  token?: string | null;
  projectId?: string | null;
  teamId?: string | null;
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
};

export class VercelDomainApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = "VercelDomainApiError";
    this.status = status;
    this.code = code;
  }
}

const API_ORIGIN = "https://api.vercel.com";

export function createVercelDomainClient(
  options: VercelDomainClientOptions,
): VercelDomainClient {
  const token = options.token?.trim() ?? "";
  const projectId = options.projectId?.trim() ?? "";
  if (!token || !projectId) return unconfiguredClient();

  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = Math.min(30_000, Math.max(1_000, options.timeoutMs ?? 8_000));

  async function projectRequest(
    domain: string,
    method: "GET" | "POST" | "DELETE",
    action: "add" | "get" | "verify" | "remove",
  ): Promise<unknown> {
    const normalizedDomain = requireDomain(domain);
    const version = action === "add" ? "v10" : "v9";
    const suffix = action === "add"
      ? ""
      : `/${encodeURIComponent(normalizedDomain)}${action === "verify" ? "/verify" : ""}`;
    const url = providerUrl(
      `/${version}/projects/${encodeURIComponent(projectId)}/domains${suffix}`,
      options.teamId,
    );
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: action === "add" ? JSON.stringify({ name: normalizedDomain }) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (action === "remove" && response.status === 404) return null;
    return readProviderResponse(response);
  }

  function readSnapshot(
    domain: string,
    value: unknown,
    configValue: unknown,
  ): VercelDomainSnapshot {
    const project = parseProjectDomain(value, domain, projectId);
    const config = parseDomainConfig(configValue);
    return {
      status: "configured",
      ...project,
      ...config,
      checkedAt: now().toISOString(),
    };
  }

  async function domainConfig(domain: string): Promise<unknown> {
    const normalizedDomain = requireDomain(domain);
    const url = providerUrl(
      `/v6/domains/${encodeURIComponent(normalizedDomain)}/config`,
      options.teamId,
      { projectIdOrName: projectId },
    );
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return readProviderResponse(response);
  }

  return {
    async addDomain(domain) {
      const config = await domainConfig(domain);
      return readSnapshot(domain, await projectRequest(domain, "POST", "add"), config);
    },
    async getDomain(domain) {
      const project = await projectRequest(domain, "GET", "get");
      return readSnapshot(domain, project, await domainConfig(domain));
    },
    async verifyDomain(domain) {
      const config = await domainConfig(domain);
      return readSnapshot(domain, await projectRequest(domain, "POST", "verify"), config);
    },
    async removeDomain(domain) {
      await projectRequest(domain, "DELETE", "remove");
      return { status: "removed" };
    },
  };
}

function unconfiguredClient(): VercelDomainClient {
  return {
    addDomain: async () => ({ status: "not_configured" }),
    getDomain: async () => ({ status: "not_configured" }),
    verifyDomain: async () => ({ status: "not_configured" }),
    removeDomain: async () => ({ status: "not_configured" }),
  };
}

function providerUrl(
  path: string,
  rawTeamId?: string | null,
  extra: Record<string, string> = {},
): string {
  const url = new URL(path, API_ORIGIN);
  const teamId = rawTeamId?.trim();
  if (teamId) url.searchParams.set("teamId", teamId);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return url.toString();
}

async function readProviderResponse(response: Response): Promise<unknown> {
  const text = (await response.text()).slice(0, 64_000);
  let value: unknown = null;
  if (text) {
    try {
      value = JSON.parse(text);
    } catch {
      if (response.ok) throw new VercelDomainApiError(response.status, null, "Vercel returned invalid JSON.");
    }
  }
  if (response.ok) return value;
  const providerError = isRecord(value) && isRecord(value.error) ? value.error : null;
  const code = providerError && typeof providerError.code === "string"
    ? providerError.code.slice(0, 100)
    : null;
  const message = providerError && typeof providerError.message === "string"
    ? providerError.message.slice(0, 500)
    : `Vercel domain request failed with status ${response.status}.`;
  throw new VercelDomainApiError(response.status, code, message);
}

function parseProjectDomain(
  value: unknown,
  requestedDomain: string,
  requestedProjectId: string,
): Omit<VercelDomainSnapshot, "status" | "checkedAt" | "misconfigured" | "configuredBy" | "recommendedIpv4" | "recommendedCname"> {
  if (!isRecord(value) || typeof value.verified !== "boolean") {
    throw new VercelDomainApiError(502, null, "Vercel returned an invalid project domain response.");
  }
  return {
    name: typeof value.name === "string" ? value.name : requestedDomain,
    apexName: typeof value.apexName === "string" ? value.apexName : null,
    projectId: typeof value.projectId === "string" ? value.projectId : requestedProjectId,
    verified: value.verified,
    verification: Array.isArray(value.verification)
      ? value.verification.slice(0, 10).flatMap(parseVerificationChallenge)
      : [],
  };
}

function parseVerificationChallenge(value: unknown): VercelVerificationChallenge[] {
  if (!isRecord(value) || typeof value.type !== "string" ||
    typeof value.domain !== "string" || typeof value.value !== "string") return [];
  return [{
    type: value.type.slice(0, 20),
    domain: value.domain.slice(0, 253),
    value: value.value.slice(0, 1_000),
    reason: typeof value.reason === "string" ? value.reason.slice(0, 500) : null,
  }];
}

function parseDomainConfig(value: unknown): Pick<
  VercelDomainSnapshot,
  "misconfigured" | "configuredBy" | "recommendedIpv4" | "recommendedCname"
> {
  if (!isRecord(value) || typeof value.misconfigured !== "boolean") {
    throw new VercelDomainApiError(502, null, "Vercel returned an invalid domain configuration response.");
  }
  return {
    misconfigured: value.misconfigured,
    configuredBy: typeof value.configuredBy === "string" ? value.configuredBy : null,
    recommendedIpv4: Array.isArray(value.recommendedIPv4)
      ? value.recommendedIPv4.slice(0, 10).flatMap((entry) =>
          isRecord(entry) && Array.isArray(entry.value)
            ? entry.value.filter((item): item is string => typeof item === "string").slice(0, 10)
            : [])
      : [],
    recommendedCname: Array.isArray(value.recommendedCNAME)
      ? value.recommendedCNAME.slice(0, 10).flatMap((entry) =>
          isRecord(entry) && typeof entry.value === "string" ? [entry.value] : [])
      : [],
  };
}

function requireDomain(value: string): string {
  const domain = value.trim().toLowerCase();
  if (domain.length > 253 || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(domain) ||
    domain.includes("..")) {
    throw new TypeError("A valid normalized domain is required.");
  }
  return domain;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
