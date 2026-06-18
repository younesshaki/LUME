import type { TenantId } from "./tenant";

export type LeadSource = "chat" | "contact-form" | "test-drive" | "csv-import" | "api";
export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";

export type Lead = {
  id: string;
  tenantId: TenantId;
  source: LeadSource;
  status: LeadStatus;
  assignedTo: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  vehicleId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null;
  ipAddr: string | null;
  userAgent: string | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeadCaptureInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  message?: string;
  vehicleId?: string;
  source?: Extract<LeadSource, "chat" | "contact-form" | "test-drive" | "api">;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

export type LeadCaptureResponse = {
  leadId: string;
};
