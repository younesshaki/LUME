/** Server-owned short-lived grounding state for the authenticated concierge. */
export type AdminResultKind = "vehicles" | "leads" | "customers" | "pages" | "feed_runs";

export type AdminConciergeResultSet = {
  kind: AdminResultKind;
  orderedIds: string[];
  totalCount: number;
  href: string;
  createdAt: string;
};

export type AdminConciergeState = {
  lastResultSet: AdminConciergeResultSet | null;
  selected: { id: string; kind: Exclude<AdminResultKind, "feed_runs"> } | null;
};

export const ADMIN_RESULT_SET_TTL_MS = 15 * 60 * 1_000;

export function emptyAdminConciergeState(): AdminConciergeState {
  return { lastResultSet: null, selected: null };
}

export function normalizeAdminConciergeState(value: unknown, nowMs = Date.now()): AdminConciergeState {
  if (!isRecord(value) || !isRecord(value.lastResultSet)) return emptyAdminConciergeState();
  const result = value.lastResultSet;
  const kind = result.kind;
  const createdAt = typeof result.createdAt === "string" ? result.createdAt : "";
  const timestamp = Date.parse(createdAt);
  const totalCount = result.totalCount;
  if ((kind !== "vehicles" && kind !== "leads" && kind !== "customers" && kind !== "pages" && kind !== "feed_runs") ||
      !Number.isFinite(timestamp) || nowMs - timestamp > ADMIN_RESULT_SET_TTL_MS || timestamp > nowMs + 60_000 ||
      typeof result.href !== "string" || !result.href.startsWith("/admin/") ||
      typeof totalCount !== "number" || !Number.isInteger(totalCount) || totalCount < 0 ||
      !Array.isArray(result.orderedIds)) return emptyAdminConciergeState();
  const orderedIds = result.orderedIds
    .filter((id): id is string => typeof id === "string" && UUID_RE.test(id))
    .slice(0, 5);
  if (totalCount === 0 || orderedIds.length === 0) return emptyAdminConciergeState();
  const selectedCandidate = isRecord(value.selected) ? value.selected : null;
  const selectedKind = selectedCandidate?.kind;
  const selected = selectedCandidate && typeof selectedCandidate.id === "string" && UUID_RE.test(selectedCandidate.id) &&
    isNavigableResultKind(selectedKind) && selectedKind === kind && orderedIds.includes(selectedCandidate.id)
    ? { id: selectedCandidate.id, kind: selectedKind }
    : null;
  return { lastResultSet: { kind, orderedIds, totalCount, href: result.href, createdAt }, selected };
}

export function resultSetState(input: Omit<AdminConciergeResultSet, "createdAt">, nowMs = Date.now()): AdminConciergeState {
  if (input.totalCount <= 0 || input.orderedIds.length === 0) return emptyAdminConciergeState();
  return normalizeAdminConciergeState({
    lastResultSet: { ...input, createdAt: new Date(nowMs).toISOString() },
  }, nowMs);
}

export function selectAdminConciergeResult(
  state: AdminConciergeState,
  id: string,
  kind: Exclude<AdminResultKind, "feed_runs">,
): AdminConciergeState {
  if (!state.lastResultSet || state.lastResultSet.kind !== kind || !state.lastResultSet.orderedIds.includes(id)) {
    return state;
  }
  return { ...state, selected: { id, kind } };
}

export type AdminPresentationRequest =
  | { kind: "show_results"; href: string; totalCount: number; resultKind: AdminResultKind }
  | { kind: "open_result"; id: string; resultKind: "vehicles" | "leads" | "customers" | "pages" }
  | null;

/**
 * Resolve terse references only from the exact server-issued result set. It
 * never reruns a broad query, and feed rows have no direct admin detail route.
 */
export function resolveAdminPresentationRequest(
  message: string,
  state: AdminConciergeState,
): AdminPresentationRequest {
  const resultSet = state.lastResultSet;
  const normalized = message.toLocaleLowerCase().trim().replace(/\s+/g, " ");
  if (/^(?:open|show|view) it$/.test(normalized) && state.selected) {
    return { kind: "open_result", id: state.selected.id, resultKind: state.selected.kind };
  }
  if (!resultSet) return null;
  if (/^(?:show me|show them|show results|open results|take me there)$/.test(normalized)) {
    return { kind: "show_results", href: resultSet.href, totalCount: resultSet.totalCount, resultKind: resultSet.kind };
  }
  const ordinal = ordinalFromMessage(normalized);
  if (ordinal === null || ordinal >= resultSet.orderedIds.length || resultSet.kind === "feed_runs") return null;
  return { kind: "open_result", id: resultSet.orderedIds[ordinal], resultKind: resultSet.kind };
}

function ordinalFromMessage(value: string): number | null {
  const match = value.match(/\b(?:open|show|view|take me to)\s+(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th)\s+(?:one|result|vehicle|lead|customer|page)\b/);
  if (!match) return null;
  return ({ first: 0, "1st": 0, second: 1, "2nd": 1, third: 2, "3rd": 2, fourth: 3, "4th": 3, fifth: 4, "5th": 4 } as const)[match[1] as "first"] ?? null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isNavigableResultKind(value: unknown): value is Exclude<AdminResultKind, "feed_runs"> {
  return value === "vehicles" || value === "leads" || value === "customers" || value === "pages";
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
