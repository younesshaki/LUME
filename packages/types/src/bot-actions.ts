import type { TenantId } from "./tenant";
import type { ConciergeTargetClientDescriptor } from "./conciergeTargets";
import type { Vehicle, VehicleSort } from "./vehicle";

/**
 * A bounded, public-safe first page already verified by the concierge's
 * tenant-scoped inventory query. It is optional acceleration data only: the
 * browser still owns filters, navigation and subsequent pagination.
 */
export type BotInventoryResultPreview = {
  vehicles: Array<Pick<Vehicle,
    | "id"
    | "stockType"
    | "year"
    | "make"
    | "model"
    | "trim"
    | "price"
    | "mileage"
    | "bodyStyle"
    | "exteriorColor"
    | "interiorColor"
    | "drivetrain"
    | "fuelType"
    | "imageSrc"
    | "primaryImageSrc"
    | "primaryImageAlt"
    | "sellerCity"
    | "sellerState"
    | "isSpecial"
    | "specialImageSrc"
  >>;
  totalCount: number;
  hasMore: boolean;
};

export type BotNavigationAction = {
  type: "navigate";
  route: string;
};

export type BotInventoryFilterAction = {
  type: "filter_inventory";
  /** Grounded inventory constraints mirrored onto the public inventory UI. */
  make?: string;
  model?: string;
  stockType?: string;
  priceMin?: number;
  priceMax?: number;
  bodyStyle?: string;
  fuelType?: string;
  drivetrain?: string;
  sellerState?: string;
  sellerCity?: string;
  yearMin?: number;
  yearMax?: number;
  mileageMax?: number;
  sort?: VehicleSort;
  /** Bounded ranked result set requested by the visitor (for example, top 10). */
  limit?: number;
  /** Optional server-grounded page one; never authored or trusted from model text. */
  initialResults?: BotInventoryResultPreview;
};

export type BotHighlightVehicleAction = {
  type: "highlight-vehicle";
  vehicleId: string;
};

/** Opens the public side-by-side comparison with 2–3 grounded vehicles. */
export type BotCompareVehiclesAction = {
  type: "compare_vehicles";
  vehicleIds: string[];
};

export type BotOpenLeadFormAction = {
  type: "open-lead-form";
  prefill?: Record<string, unknown>;
  vehicleId?: string;
  attribution?: BotActionAttribution;
};

/**
 * @deprecated Retired from the public concierge (2026-09-24). A free-form
 * `sectionId` cannot be validated against anything the tenant registered, and
 * no browser consumer ever existed, so the action was a silent no-op the model
 * could still claim it had performed. Section scrolling is available through
 * `navigate-target` with a tenant-registered `section-anchor` target. The type
 * is kept only so legacy model output can be recognised and stripped.
 */
export type BotScrollToAction = {
  type: "scroll-to";
  sectionId: string;
};

/**
 * In-site "go back", authored ONLY by the chat server's deterministic rules.
 *
 * It deliberately carries no URL, path, route or history index: the browser
 * resolves the destination from its own same-origin record of pages visited
 * in this LUME tab, so neither the model nor a crafted payload can choose
 * where the visitor lands, and the visitor can never be sent off the site.
 */
export type BotNavigateBackAction = {
  type: "navigate-back";
  /**
   * `previous` — the page before the current one.
   * `results`  — the most recent inventory results page.
   */
  destination: "previous" | "results";
  /**
   * Server-grounded results to open when the browser has no usable in-app
   * history (for example, the visitor landed directly on a vehicle page).
   * Built from the conversation's verified result set, never from model text.
   */
  fallback?: BotInventoryFilterAction;
};

export type BotAction =
  | BotInventoryFilterAction
  | BotNavigationAction
  | BotNavigateTargetAction
  | BotHighlightVehicleAction
  | BotCompareVehiclesAction
  | BotOpenLeadFormAction
  | BotCaptureLeadAction
  | BotNavigateBackAction;

/** At least one of email or phone is required. */
export type BotLeadContact = {
  firstName?: string;
  lastName?: string;
  message?: string;
} & (
  | { email: string; phone?: string }
  | { phone: string; email?: string }
);

export type BotCaptureLeadAction = {
  type: "capture_lead";
  contact: BotLeadContact;
  vehicleId?: string;
  attribution?: BotActionAttribution;
};

/** Server-authored context; model-supplied values are discarded before emit. */
export type BotActionAttribution = {
  targetKey?: string;
  sessionId?: string;
  conversationContext?: string;
};

/**
 * The model emits only targetKey + string params. The chat server resolves the
 * enabled tenant target and attaches the trusted descriptor before the action
 * reaches the browser.
 */
export type BotNavigateTargetAction = {
  type: "navigate-target";
  targetKey: string;
  params?: Record<string, string>;
  target?: ConciergeTargetClientDescriptor;
  attribution?: BotActionAttribution;
};

/**
 * Deferred — not part of `BotAction`. No public flow exists that collects a
 * date/time with the visitor's explicit confirmation and creates an
 * attributed appointment; see PUBLIC_CONCIERGE_DEFERRED_ACTIONS.
 */
export type BotScheduleAppointmentAction = {
  type: "schedule_appointment";
  appointmentType: "appointment";
  contact: BotLeadContact;
  vehicleId?: string;
  /** ISO-8601 date (YYYY-MM-DD) */
  preferredDate?: string;
  /** ISO-8601 time (HH:MM) */
  preferredTime?: string;
  message?: string;
};

/** Deferred — not part of `BotAction`. See BotScheduleAppointmentAction. */
export type BotScheduleTestDriveAction = {
  type: "schedule_test_drive";
  contact: BotLeadContact;
  vehicleId?: string;
  /** ISO-8601 date (YYYY-MM-DD) */
  preferredDate?: string;
  /** ISO-8601 time (HH:MM) */
  preferredTime?: string;
  message?: string;
};

export type BotActionStatus = "success" | "failure";

export type BotActionResponse = {
  action: BotAction;
  status: BotActionStatus;
  message: string;
  /** Structured error info when status is failure */
  error?: { code: string };
};

export type BotActionPermission = {
  tenantId: TenantId;
  navigate: boolean;
  filterInventory: boolean;
  captureLead: boolean;
  scheduleAppointment: boolean;
  scheduleTestDrive: boolean;
};

export type BotActionRequest = {
  tenantId: TenantId;
  conversationId?: string;
  messageId?: string;
  action: BotAction;
};
