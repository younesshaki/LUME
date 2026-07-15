import { publicTenantSlug } from "@/lib/publicTenant";
import type {
  LoyaltyTransaction,
  Visitor,
  VisitorLoginInput,
  VisitorLoyalty,
  VisitorSavedVehicle,
  VisitorSignupInput,
} from "./types";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type VisitorClient = {
  signup: (input: VisitorSignupInput, signal?: AbortSignal) => Promise<{ visitorId: string }>;
  login: (input: VisitorLoginInput, signal?: AbortSignal) => Promise<Visitor>;
  logout: (signal?: AbortSignal) => Promise<void>;
  getMe: (signal?: AbortSignal) => Promise<Visitor | null>;
  getLoyalty: (signal?: AbortSignal) => Promise<VisitorLoyalty>;
  getSavedVehicles: (signal?: AbortSignal) => Promise<VisitorSavedVehicle[]>;
  saveVehicle: (vehicleId: string, signal?: AbortSignal) => Promise<{ created: boolean }>;
  removeSavedVehicle: (vehicleId: string, signal?: AbortSignal) => Promise<void>;
};

export class VisitorApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "VisitorApiError";
    this.status = status;
  }
}

export function createVisitorClient({
  fetcher = globalFetch,
  tenantSlug = publicTenantSlug,
}: {
  fetcher?: Fetcher;
  tenantSlug?: string;
} = {}): VisitorClient {
  let getMeRequest: Promise<Visitor | null> | null = null;
  const request = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    headers.set("X-Lume-Tenant", tenantSlug);

    return fetcher(path, {
      ...init,
      credentials: "include",
      headers,
    });
  };

  return {
    async signup(input, signal) {
      const response = await request("/api/visitor/signup", {
        method: "POST",
        body: JSON.stringify(input),
        signal,
      });
      await ensureOk(response);
      const payload = await readJson(response);
      if (!isRecord(payload) || typeof payload.visitorId !== "string") {
        throw new VisitorApiError(response.status, "The sign-up response was invalid.");
      }
      return { visitorId: payload.visitorId };
    },

    async login(input, signal) {
      const response = await request("/api/visitor/login", {
        method: "POST",
        body: JSON.stringify(input),
        signal,
      });
      await ensureOk(response);
      const payload = await readJson(response);
      if (!isRecord(payload) || !isVisitor(payload.visitor)) {
        throw new VisitorApiError(response.status, "The login response was invalid.");
      }
      return payload.visitor;
    },

    async logout(signal) {
      const response = await request("/api/visitor/logout", {
        method: "POST",
        signal,
      });
      await ensureOk(response);
    },

    async getMe(signal) {
      if (!signal && getMeRequest) return getMeRequest;
      const lookup = (async (): Promise<Visitor | null> => {
        const response = await request("/api/visitor/me", { signal });
        if (response.status === 401) return null;
        await ensureOk(response);
        const payload = await readJson(response);
        if (!isRecord(payload) || !isVisitor(payload.visitor)) {
          throw new VisitorApiError(response.status, "The account response was invalid.");
        }
        return payload.visitor;
      })();
      if (!signal) {
        getMeRequest = lookup;
        const clear = () => {
          if (getMeRequest === lookup) getMeRequest = null;
        };
        void lookup.then(clear, clear);
      }
      return lookup;
    },

    async getLoyalty(signal) {
      const response = await request("/api/visitor/loyalty", { signal });
      await ensureOk(response);
      const payload = await readJson(response);
      if (!isVisitorLoyalty(payload)) {
        throw new VisitorApiError(response.status, "The loyalty response was invalid.");
      }
      return payload;
    },

    async getSavedVehicles(signal) {
      const response = await request("/api/visitor/saved-vehicles", { signal });
      await ensureOk(response);
      const payload = await readJson(response);
      if (!isRecord(payload) || !Array.isArray(payload.savedVehicles) || !payload.savedVehicles.every(isSavedVehicle)) {
        throw new VisitorApiError(response.status, "The saved vehicles response was invalid.");
      }
      return payload.savedVehicles;
    },

    async saveVehicle(vehicleId, signal) {
      const response = await request("/api/visitor/saved-vehicles", {
        method: "POST",
        body: JSON.stringify({ vehicleId }),
        signal,
      });
      await ensureOk(response);
      const payload = await readJson(response);
      if (!isRecord(payload) || typeof payload.created !== "boolean") {
        throw new VisitorApiError(response.status, "The save response was invalid.");
      }
      return { created: payload.created };
    },

    async removeSavedVehicle(vehicleId, signal) {
      const response = await request(`/api/visitor/saved-vehicles/${encodeURIComponent(vehicleId)}`, {
        method: "DELETE",
        signal,
      });
      await ensureOk(response);
    },
  };
}

export const visitorClient = createVisitorClient();

async function globalFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

async function ensureOk(response: Response): Promise<void> {
  if (response.ok) return;

  let message = `Visitor API request failed (${response.status}).`;
  try {
    const payload = await response.json() as unknown;
    if (isRecord(payload)) {
      if (typeof payload.message === "string" && payload.message.trim()) {
        message = payload.message;
      } else if (typeof payload.error === "string" && payload.error.trim()) {
        message = payload.error;
      }
    }
  } catch {
    // Keep the status-based fallback when the response is not JSON.
  }

  throw new VisitorApiError(response.status, message);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    throw new VisitorApiError(response.status, "The visitor API returned invalid JSON.");
  }
}

function isVisitor(value: unknown): value is Visitor {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.email === "string" &&
    typeof value.firstName === "string" &&
    typeof value.lastName === "string" &&
    typeof value.createdAt === "string"
  );
}

function isVisitorLoyalty(value: unknown): value is VisitorLoyalty {
  return (
    isRecord(value) &&
    typeof value.points === "number" &&
    Number.isFinite(value.points) &&
    (value.tier === null || isLoyaltyTier(value.tier)) &&
    Array.isArray(value.transactions) &&
    value.transactions.every(isLoyaltyTransaction)
  );
}

function isLoyaltyTier(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.threshold === "number" &&
    Number.isFinite(value.threshold)
  );
}

function isLoyaltyTransaction(value: unknown): value is LoyaltyTransaction {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.delta === "number" &&
    Number.isFinite(value.delta) &&
    typeof value.reason === "string" &&
    typeof value.createdAt === "string"
  );
}

function isSavedVehicle(value: unknown): value is VisitorSavedVehicle {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.vehicleId === "string" &&
    typeof value.savedAt === "string" &&
    (value.year === null || typeof value.year === "number") &&
    (value.make === null || typeof value.make === "string") &&
    (value.model === null || typeof value.model === "string") &&
    (value.trim === null || typeof value.trim === "string") &&
    (value.price === null || typeof value.price === "number") &&
    (value.status === "live" || value.status === "sold" || value.status === "archived" || value.status === "draft" || value.status === "unavailable") &&
    (value.imageSrc === null || typeof value.imageSrc === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
