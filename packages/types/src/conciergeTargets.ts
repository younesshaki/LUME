export const CONCIERGE_TARGET_KINDS = [
  "route",
  "section-anchor",
  "form",
  "modal",
] as const;

export type ConciergeTargetKind = (typeof CONCIERGE_TARGET_KINDS)[number];

export const CONCIERGE_TARGET_LIMITS = {
  maxTargetsPerTenant: 50,
  key: 64,
  label: 80,
  destination: 300,
  aiDescription: 500,
  examplePrompts: 6,
  examplePrompt: 160,
} as const;

export type ConciergeTargetConfig = {
  key: string;
  label: string;
  kind: ConciergeTargetKind;
  destination: string;
  aiDescription: string;
  isConversion: boolean;
  enabled: boolean;
  examplePrompts: string[];
  sortOrder: number;
};

export type ConciergeTarget = ConciergeTargetConfig & {
  id: string | null;
  tenantId: string | null;
  builtIn: boolean;
};

/** The minimum trusted descriptor sent to the browser with an action. */
export type ConciergeTargetClientDescriptor = Pick<
  ConciergeTarget,
  "key" | "label" | "kind" | "destination" | "isConversion"
>;

export type ConciergeTargetOverride = Partial<ConciergeTargetConfig> & {
  id?: string | null;
  tenantId?: string | null;
  key: string;
};

export type ConciergeTargetValidation =
  | { ok: true; value: ConciergeTargetConfig }
  | { ok: false; error: string };

/**
 * Product-owned targets are available before a tenant stores any overrides.
 * Their destinations are deliberately public, finite and data-only.
 */
export const DEFAULT_CONCIERGE_TARGETS: readonly ConciergeTarget[] = [
  {
    id: null,
    tenantId: null,
    builtIn: true,
    key: "inventory",
    label: "Vehicle inventory",
    kind: "route",
    destination: "/vehicles",
    aiDescription:
      "The live vehicle inventory. Send visitors here when they want to browse, compare, or filter available vehicles.",
    isConversion: false,
    enabled: true,
    examplePrompts: ["Show me your cars", "What vehicles are available?"],
    sortOrder: 10,
  },
  {
    id: null,
    tenantId: null,
    builtIn: true,
    key: "vehicle-detail",
    label: "Vehicle detail",
    kind: "route",
    destination: "/vehicles/:vehicleId",
    aiDescription:
      "A specific live vehicle page. Use only when the exact vehicleId is present in grounded inventory or tool results.",
    isConversion: false,
    enabled: true,
    examplePrompts: ["Show me that Ferrari", "Open the 360 Spider"],
    sortOrder: 20,
  },
  {
    id: null,
    tenantId: null,
    builtIn: true,
    key: "contact-lead-form",
    label: "Contact and lead form",
    kind: "form",
    destination: "/contact#concierge-lead-form",
    aiDescription:
      "The general dealership contact form. Offer it when a visitor wants follow-up, has a buying question, or is ready to share contact details.",
    isConversion: true,
    enabled: true,
    examplePrompts: ["Have someone contact me", "I want to speak with the dealership"],
    sortOrder: 30,
  },
  {
    id: null,
    tenantId: null,
    builtIn: true,
    key: "vehicle-inquiry",
    label: "Vehicle inquiry",
    kind: "modal",
    destination: "/vehicles/:vehicleId#vehicle-inquiry",
    aiDescription:
      "The inquiry form for one specific vehicle. Use when the visitor wants pricing details, availability confirmation, or dealer follow-up for a grounded vehicleId.",
    isConversion: true,
    enabled: true,
    examplePrompts: ["Is this vehicle still available?", "I want more information about this car"],
    sortOrder: 40,
  },
] as const;

const TARGET_KEY_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const DESTINATION_PARAM_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,39}$/;
const TARGET_FRAGMENT_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
const FORBIDDEN_PUBLIC_PREFIXES = ["/admin", "/api", "/__preview"] as const;

export function isConciergeTargetKey(value: string): boolean {
  return TARGET_KEY_PATTERN.test(value);
}

export function validateConciergeTargetDestination(
  kind: ConciergeTargetKind,
  destination: string,
): string | null {
  if (!destination || destination.length > CONCIERGE_TARGET_LIMITS.destination) {
    return `Destination must be between 1 and ${CONCIERGE_TARGET_LIMITS.destination} characters.`;
  }
  if (/[\u0000-\u001f\u007f\\\s]/.test(destination)) {
    return "Destination cannot contain whitespace, control characters, or backslashes.";
  }
  if (
    destination.includes("%") ||
    destination.includes("?") ||
    destination.includes("://") ||
    destination.startsWith("//") ||
    destination
      .split("#", 1)[0]
      ?.split("/")
      .some((segment) => segment === "." || segment === "..")
  ) {
    return "Destination must be a canonical root-relative public path without encoding, traversal, or a query string.";
  }

  const fragments = destination.split("#");
  if (fragments.length > 2) return "Destination can contain at most one target anchor.";
  const path = fragments[0] ?? "";
  const fragment = fragments[1];
  if (!path.startsWith("/")) return "Destination must start with a forward slash.";
  if (
    FORBIDDEN_PUBLIC_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  ) {
    return "Destination must point to a public website route.";
  }

  for (const segment of path.split("/").filter(Boolean)) {
    if (!segment.startsWith(":")) continue;
    if (!DESTINATION_PARAM_PATTERN.test(segment.slice(1))) {
      return "Destination contains an invalid route parameter.";
    }
  }

  if (kind === "route" && fragment !== undefined) {
    return "Route targets cannot include an anchor.";
  }
  if (kind !== "route") {
    if (!fragment || !TARGET_FRAGMENT_PATTERN.test(fragment)) {
      return `${kind} targets require a safe anchor or handler after #.`;
    }
  }
  return null;
}

export function validateConciergeTargetInput(
  input: Partial<ConciergeTargetConfig>,
): ConciergeTargetValidation {
  const key = cleanText(input.key, CONCIERGE_TARGET_LIMITS.key);
  if (!key || !isConciergeTargetKey(key)) {
    return {
      ok: false,
      error:
        "Key must start with a lowercase letter and contain only lowercase letters, numbers, or hyphens.",
    };
  }

  const label = cleanText(input.label, CONCIERGE_TARGET_LIMITS.label);
  if (!label) return { ok: false, error: "Label is required." };

  const kind = CONCIERGE_TARGET_KINDS.includes(input.kind as ConciergeTargetKind)
    ? (input.kind as ConciergeTargetKind)
    : null;
  if (!kind) return { ok: false, error: "Target kind is invalid." };

  const destination = cleanText(input.destination, CONCIERGE_TARGET_LIMITS.destination);
  if (!destination) return { ok: false, error: "Destination is required." };
  const destinationError = validateConciergeTargetDestination(kind, destination);
  if (destinationError) return { ok: false, error: destinationError };

  const aiDescription = cleanText(
    input.aiDescription,
    CONCIERGE_TARGET_LIMITS.aiDescription,
  );
  if (!aiDescription) return { ok: false, error: "AI description is required." };

  const prompts = Array.isArray(input.examplePrompts)
    ? input.examplePrompts
        .map((prompt) => cleanText(prompt, CONCIERGE_TARGET_LIMITS.examplePrompt))
        .filter((prompt): prompt is string => Boolean(prompt))
        .slice(0, CONCIERGE_TARGET_LIMITS.examplePrompts)
    : [];
  const sortOrder =
    typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
      ? Math.max(0, Math.min(9_999, Math.round(input.sortOrder)))
      : 0;

  return {
    ok: true,
    value: {
      key,
      label,
      kind,
      destination,
      aiDescription,
      isConversion: input.isConversion === true,
      enabled: input.enabled !== false,
      examplePrompts: prompts,
      sortOrder,
    },
  };
}

/**
 * Merge trusted tenant overrides onto product defaults. Invalid rows are
 * ignored, which keeps chat and Admin usable while a malformed legacy row is
 * repaired. Custom rows must pass the same finite validation.
 */
export function mergeConciergeTargets(
  overrides: readonly ConciergeTargetOverride[],
): ConciergeTarget[] {
  const defaults = new Map(
    DEFAULT_CONCIERGE_TARGETS.map((target) => [target.key, cloneTarget(target)]),
  );
  const custom: ConciergeTarget[] = [];

  for (const override of overrides) {
    const base = defaults.get(override.key);
    const validation = validateConciergeTargetInput({
      ...(base ?? {}),
      ...override,
      key: override.key,
    });
    if (!validation.ok) continue;
    const target: ConciergeTarget = {
      ...validation.value,
      id: override.id ?? base?.id ?? null,
      tenantId: override.tenantId ?? base?.tenantId ?? null,
      builtIn: Boolean(base),
    };
    if (base) defaults.set(target.key, target);
    else custom.push(target);
  }

  return [...defaults.values(), ...custom].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.label.localeCompare(right.label) ||
      left.key.localeCompare(right.key),
  );
}

export function conciergeTargetClientDescriptor(
  target: ConciergeTarget,
): ConciergeTargetClientDescriptor {
  return {
    key: target.key,
    label: target.label,
    kind: target.kind,
    destination: target.destination,
    isConversion: target.isConversion,
  };
}

function cloneTarget(target: ConciergeTarget): ConciergeTarget {
  return { ...target, examplePrompts: [...target.examplePrompts] };
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
  return cleaned || null;
}
