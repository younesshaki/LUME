import type { TenantId } from "./tenant";

export type BotNavigationAction = {
  type: "navigate";
  route: string;
};

export type BotInventoryFilterAction = {
  type: "filter_inventory";
  /** Fields intentionally limited vs VehicleQuery — bot filters are coarse by design. */
  make?: string;
  priceMin?: number;
  priceMax?: number;
  bodyStyle?: string;
};

export type BotHighlightVehicleAction = {
  type: "highlight-vehicle";
  vehicleId: string;
};

export type BotOpenLeadFormAction = {
  type: "open-lead-form";
  prefill?: Record<string, unknown>;
};

export type BotScrollToAction = {
  type: "scroll-to";
  sectionId: string;
};

export type BotAction =
  | BotInventoryFilterAction
  | BotNavigationAction
  | BotHighlightVehicleAction
  | BotOpenLeadFormAction
  | BotScrollToAction
  | BotCaptureLeadAction;

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
};

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
