const ATTRIBUTION_STORAGE_KEY = "lume-lead-attribution";

const ATTRIBUTION_LIMITS = {
  utmSource: 120,
  utmMedium: 120,
  utmCampaign: 120,
  utmContent: 120,
  referrer: 2_048,
} as const;

const UTM_PARAMETERS = {
  utmSource: "utm_source",
  utmMedium: "utm_medium",
  utmCampaign: "utm_campaign",
  utmContent: "utm_content",
} as const;

export type LeadAttribution = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  referrer?: string;
};

export type LeadAttributionOverrides = {
  [Key in keyof LeadAttribution]?: string | null;
};

type AttributionStorage = Pick<Storage, "getItem" | "setItem">;

export type LeadAttributionEnvironment = {
  search?: string;
  referrer?: string;
  storage?: AttributionStorage | null;
};

/**
 * Returns the first attribution observed in this tab, merged with values that
 * are known more precisely by the caller. Browser state is optional so this is
 * safe to call while rendering outside the browser.
 */
export function getLeadAttribution(
  overrides: LeadAttributionOverrides = {},
  environment: LeadAttributionEnvironment = readBrowserEnvironment(),
): LeadAttribution {
  const stored = readStoredAttribution(environment.storage);
  const firstTouch = stored ?? captureAttribution(environment.search, environment.referrer);

  if (stored === null) {
    writeStoredAttribution(environment.storage, firstTouch);
  }

  return mergeOverrides(firstTouch, overrides);
}

function readBrowserEnvironment(): LeadAttributionEnvironment {
  let search = "";
  let referrer = "";
  let storage: AttributionStorage | null = null;

  if (typeof window !== "undefined") {
    try {
      search = window.location.search;
    } catch {
      // Location access can be denied in sandboxed browsing contexts.
    }

    try {
      storage = window.sessionStorage;
    } catch {
      // Storage can be unavailable in private or sandboxed browsing contexts.
    }
  }

  if (typeof document !== "undefined") {
    try {
      referrer = document.referrer;
    } catch {
      // Treat an inaccessible referrer as absent.
    }
  }

  return { search, referrer, storage };
}

function captureAttribution(search = "", referrer = ""): LeadAttribution {
  const captured: LeadAttribution = {};
  let parameters: URLSearchParams;

  try {
    parameters = new URLSearchParams(search);
  } catch {
    parameters = new URLSearchParams();
  }

  for (const [field, parameter] of Object.entries(UTM_PARAMETERS) as Array<
    [keyof typeof UTM_PARAMETERS, string]
  >) {
    const value = normalizeValue(field, parameters.get(parameter));
    if (value) captured[field] = value;
  }

  const normalizedReferrer = normalizeValue("referrer", referrer);
  if (normalizedReferrer) captured.referrer = normalizedReferrer;

  return captured;
}

function readStoredAttribution(storage: AttributionStorage | null | undefined): LeadAttribution | null {
  if (!storage) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(ATTRIBUTION_STORAGE_KEY);
  } catch {
    return null;
  }

  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;

    const attribution: LeadAttribution = {};
    for (const field of Object.keys(ATTRIBUTION_LIMITS) as Array<keyof LeadAttribution>) {
      const value = parsed[field];
      if (value !== undefined && typeof value !== "string") return null;

      const normalized = normalizeValue(field, value);
      if (normalized) attribution[field] = normalized;
    }
    return attribution;
  } catch {
    return null;
  }
}

function writeStoredAttribution(
  storage: AttributionStorage | null | undefined,
  attribution: LeadAttribution,
): void {
  if (!storage) return;

  try {
    storage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Attribution must never prevent a lead submission when storage is full or blocked.
  }
}

function mergeOverrides(
  firstTouch: LeadAttribution,
  overrides: LeadAttributionOverrides,
): LeadAttribution {
  const merged = { ...firstTouch };

  for (const field of Object.keys(ATTRIBUTION_LIMITS) as Array<keyof LeadAttribution>) {
    const override = overrides[field];
    if (override === undefined) continue;
    if (override === null) {
      delete merged[field];
      continue;
    }

    const normalized = normalizeValue(field, override);
    if (normalized) merged[field] = normalized;
  }

  return merged;
}

function normalizeValue(field: keyof LeadAttribution, value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, ATTRIBUTION_LIMITS[field]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
