import type { TenantId } from "./tenant";

export type BotActionTarget = "vehicle" | "products" | "contact";

export type BotNavigationAction = {
  type: "navigate";
  target: BotActionTarget;
  vehicleId?: string;
};

export type BotInventoryFilterAction = {
  type: "filter_inventory";
  make?: string;
  priceMin?: number;
  priceMax?: number;
  bodyStyle?: string;
};

export type BotLeadContact = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  message?: string;
};

export type BotCaptureLeadAction = {
  type: "capture_lead";
  contact: BotLeadContact;
  vehicleId?: string;
};

export type BotAppointmentType = "appointment" | "test_drive";

export type BotScheduleAppointmentAction = {
  type: "schedule_appointment";
  appointmentType: BotAppointmentType;
  contact: BotLeadContact;
  vehicleId?: string;
  preferredDate?: string;
  preferredTime?: string;
  message?: string;
};

export type BotAction =
  | BotNavigationAction
  | BotInventoryFilterAction
  | BotCaptureLeadAction
  | BotScheduleAppointmentAction;

export type BotActionStatus = "success" | "failure";

export type BotActionResponse = {
  action: BotAction;
  status: BotActionStatus;
  message: string;
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
