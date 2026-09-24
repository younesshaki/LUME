/**
 * Visitor-perceived speed of the public concierge, measured in the browser.
 *
 * Two measurements, both content-free:
 *
 * 1. Per turn (`ClientTurnTimer`) — milliseconds from the moment the visitor
 *    pressed send to each thing they can perceive: their own bubble painted,
 *    the request leaving, response headers, the first stream event, the first
 *    action, the first words received and painted, and the end. The server's
 *    own stage timings arrive in the stream's `timing` event and are merged
 *    into the SAME PostHog event, so one row explains a slow turn end to end:
 *    `client_network_overhead_ms` is the part neither side's code controls
 *    (network, TLS, the public site's /api/chat proxy hop, cold starts).
 *
 * 2. Per action (`noteConciergeActionDispatched` …) — from the moment an
 *    action is handed to the site to the destination route being painted, and
 *    to its data being rendered (inventory results, vehicle detail).
 *
 * "Painted" means after the next frame was produced (two animation frames),
 * not merely after React state was set — that is what the visitor sees.
 *
 * Everything here is best-effort and never throws into the chat.
 */
import type { BotAction } from "@lume/types";
import { captureLumeEvent } from "./posthog";

type Properties = Record<string, boolean | number | string | null | undefined>;

/**
 * Every concierge speed event goes through here. Besides PostHog, it appends
 * to `window.__lumeSpeedProbe` when — and only when — a test pre-installed
 * that array, so browser tests can assert the exact payload. Production never
 * defines it; the probe cannot turn itself on.
 */
export function captureConciergeSpeedEvent(name: string, properties: Properties): void {
  try {
    sink(name, properties);
  } catch {
    // Analytics never affects the visitor.
  }
  try {
    const probe = (globalThis as { __lumeSpeedProbe?: unknown }).__lumeSpeedProbe;
    if (Array.isArray(probe)) probe.push({ name, properties: { ...properties } });
  } catch {
    // Test-only probe.
  }
}

export const CLIENT_TURN_MARKS = [
  /** The visitor's own message bubble painted. */
  "submit_painted",
  /** fetch() called. */
  "request_sent",
  /** Response headers received (server started the stream, via the proxy). */
  "response_headers",
  /** First stream event (meta) parsed. */
  "first_event",
  /** First action received from the stream. */
  "first_action_received",
  /** First action handed to the site (not suppressed as stale). */
  "first_action_dispatched",
  /** First "thinking" step received (tool turns). */
  "first_thinking",
  /** First visible text received. */
  "first_text_received",
  /** First visible text painted on screen. */
  "first_text_painted",
  /** Stream finished. */
  "done",
] as const;

export type ClientTurnMark = (typeof CLIENT_TURN_MARKS)[number];

const MAX_SERVER_FIELDS = 40;

/** Run after the next frame has actually been produced. */
export function afterNextPaint(callback: () => void): void {
  try {
    if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      setTimeout(callback, 0);
      return;
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => callback()));
  } catch {
    // Timing is best-effort.
  }
}

export class ClientTurnTimer {
  private readonly origin: number;
  private readonly marks: Partial<Record<ClientTurnMark, number>> = {};
  private server: Record<string, number | string> = {};
  private hidden = false;
  private readonly onVisibility = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      this.hidden = true;
    }
  };

  constructor(private readonly now: () => number = () => performance.now()) {
    this.origin = now();
    if (typeof document !== "undefined") {
      this.hidden = document.visibilityState === "hidden";
      document.addEventListener("visibilitychange", this.onVisibility);
    }
  }

  /** First occurrence wins. */
  mark(name: ClientTurnMark): void {
    if (this.marks[name] === undefined) {
      this.marks[name] = Math.max(0, Math.round(this.now() - this.origin));
    }
  }

  /** Mark once the next frame has been painted. */
  markAfterPaint(name: ClientTurnMark): void {
    if (this.marks[name] !== undefined) return;
    afterNextPaint(() => this.mark(name));
  }

  /** Accept the server's `timing` payload; only its known scalar fields. */
  setServerTiming(value: unknown): void {
    if (typeof value !== "object" || value === null) return;
    const accepted: Record<string, number | string> = {};
    let count = 0;
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (count >= MAX_SERVER_FIELDS) break;
      if (/^server_[a-z0-9_]+_ms$/.test(key) && typeof raw === "number" && Number.isFinite(raw)) {
        accepted[key] = Math.max(0, Math.round(raw));
        count += 1;
      } else if ((key === "route" || key === "request_id") && typeof raw === "string") {
        accepted[key === "route" ? "server_route" : "server_request_id"] = raw.slice(0, 64);
        count += 1;
      }
    }
    this.server = accepted;
  }

  elapsed(): number {
    return Math.max(0, Math.round(this.now() - this.origin));
  }

  /** Stop listening; call once the turn's event has been captured. */
  dispose(): void {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibility);
    }
  }

  properties(): Properties {
    const marks: Properties = {};
    for (const name of CLIENT_TURN_MARKS) {
      const value = this.marks[name];
      if (value !== undefined) marks[`client_${name}_ms`] = value;
    }
    const firstEvent = this.marks.first_event;
    const requestSent = this.marks.request_sent;
    const serverFirstByte = this.server.server_first_byte_ms;
    // Time neither side's code spends: network, TLS, the /api/chat proxy hop
    // and any cold start in front of the chat function.
    const networkOverhead =
      firstEvent !== undefined && requestSent !== undefined && typeof serverFirstByte === "number"
        ? Math.max(0, firstEvent - requestSent - serverFirstByte)
        : undefined;
    return {
      ...marks,
      ...this.server,
      client_network_overhead_ms: networkOverhead,
      client_was_hidden: this.hidden,
      ...connectionProperties(),
    };
  }
}

/** Coarse, non-identifying device and network context for segmentation. */
export function connectionProperties(): Properties {
  try {
    const nav = navigator as Navigator & {
      connection?: { effectiveType?: string; rtt?: number; downlink?: number; saveData?: boolean };
      deviceMemory?: number;
    };
    return {
      client_net_type: nav.connection?.effectiveType ?? null,
      client_net_rtt_ms: typeof nav.connection?.rtt === "number" ? nav.connection.rtt : null,
      client_net_downlink_mbps:
        typeof nav.connection?.downlink === "number" ? nav.connection.downlink : null,
      client_save_data: nav.connection?.saveData ?? null,
      client_cpu_cores: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
      client_device_memory_gb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
      client_viewport: typeof window !== "undefined" && window.innerWidth < 768 ? "mobile" : "desktop",
      client_release: clientRelease(),
    };
  } catch {
    return { client_release: clientRelease() };
  }
}

export function clientRelease(): string {
  const sha = import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA;
  return typeof sha === "string" && sha.trim() ? sha.trim().slice(0, 12) : "local";
}

// ── Action → page shown ────────────────────────────────────────────────────

/** Actions that move or change the page, and so have a destination to time. */
const DESTINATION_ACTIONS = new Set<BotAction["type"]>([
  "filter_inventory",
  "navigate",
  "navigate-target",
  "highlight-vehicle",
  "compare_vehicles",
  "open-lead-form",
  "navigate-back",
]);

export type DestinationKind = "inventory" | "vehicle";

/**
 * Which page's data counts as "ready" for an action. `any` accepts either
 * (back-navigation's destination is decided by the browser's history); null
 * means the destination has no data load, so the painted route is the end.
 */
export function expectedDestination(action: BotAction): DestinationKind | "any" | null {
  switch (action.type) {
    case "filter_inventory":
    case "compare_vehicles":
      return "inventory";
    case "highlight-vehicle":
      return "vehicle";
    case "navigate-target":
      if (action.targetKey === "vehicle-detail") return "vehicle";
      if (action.targetKey === "inventory") return "inventory";
      return null;
    case "navigate": {
      const route = action.route.trim().toLowerCase();
      if (/^\/?vehicles\/[^/]+/.test(route)) return "vehicle";
      if (/^\/?(?:vehicles|inventory|cars)\/?$/.test(route)) return "inventory";
      return null;
    }
    case "navigate-back":
      return "any";
    default:
      return null;
  }
}

type PendingAction = {
  turnId: string;
  actionType: BotAction["type"];
  expects: DestinationKind | "any" | null;
  dispatchedAt: number;
  startPath: string;
  routeMs: number | null;
  timer: ReturnType<typeof setTimeout> | null;
};

/** Longest wait for a destination before reporting what was reached. */
export const ACTION_TIMEOUT_MS = 10_000;

let pending: PendingAction | null = null;
let clock: () => number = () => performance.now();
let sink: (name: string, properties: Properties) => void = captureLumeEvent;
let currentPath: () => string = () =>
  typeof window === "undefined"
    ? ""
    : `${window.location.pathname}${window.location.search}${window.location.hash}`;

function finish(outcome: "ready" | "route_only" | "timeout" | "error" | "superseded", readyMs: number | null): void {
  const action = pending;
  if (!action) return;
  pending = null;
  if (action.timer) clearTimeout(action.timer);
  captureConciergeSpeedEvent("lume_concierge_action_applied", {
    turn_id: action.turnId,
    action_type: action.actionType,
    outcome,
    route_changed: action.routeMs !== null,
    action_route_ms: action.routeMs,
    action_ready_ms: readyMs,
    ...connectionProperties(),
  });
}

/** Call when the chat hands an action to the site. */
export function noteConciergeActionDispatched(turnId: string, action: BotAction): void {
  if (!DESTINATION_ACTIONS.has(action.type)) return;
  // One destination at a time: a newer action supersedes the older one.
  if (pending) finish("superseded", null);
  pending = {
    turnId,
    actionType: action.type,
    expects: expectedDestination(action),
    dispatchedAt: clock(),
    startPath: currentPath(),
    routeMs: null,
    timer: null,
  };
  const started = pending;
  started.timer = setTimeout(() => {
    if (pending === started) finish(started.routeMs !== null ? "route_only" : "timeout", null);
  }, ACTION_TIMEOUT_MS);
}

/** Call from the app shell on every route (path/search/hash) change. */
export function noteConciergeRouteRendered(path: string): void {
  const action = pending;
  if (!action || action.routeMs !== null || path === action.startPath) return;
  afterNextPaint(() => {
    if (pending === action && action.routeMs === null) {
      action.routeMs = Math.max(0, Math.round(clock() - action.dispatchedAt));
      // No data to wait for (contact page, custom page): the painted route
      // is what the visitor asked for.
      if (action.expects === null) finish("route_only", null);
    }
  });
}

/** Call when a destination page has rendered its data (or failed to). */
export function noteConciergeDestinationReady(kind: DestinationKind, ok: boolean): void {
  const action = pending;
  if (!action) return;
  if (action.expects !== "any" && action.expects !== kind) return;
  // Only the destination's data counts: the page being left may finish its
  // own load after the action was dispatched.
  if (currentPath() === action.startPath) return;
  afterNextPaint(() => {
    if (pending !== action) return;
    const readyMs = Math.max(0, Math.round(clock() - action.dispatchedAt));
    // Data can render in the same frame the route commits.
    if (action.routeMs === null) action.routeMs = readyMs;
    finish(ok ? "ready" : "error", readyMs);
  });
}

/** Test hooks. */
export function configureConciergeSpeedForTests(options: {
  now?: () => number;
  capture?: (name: string, properties: Properties) => void;
  path?: () => string;
}): void {
  if (pending?.timer) clearTimeout(pending.timer);
  pending = null;
  if (options.now) clock = options.now;
  if (options.capture) sink = options.capture;
  if (options.path) currentPath = options.path;
}
