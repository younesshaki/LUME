"use client";
import { createContext, useContext, type ComponentType } from "react";
import type { LeadCaptureInput, LeadCaptureResponse } from "@lume/types";
export type LeadServices = {
  submitLead: (input: LeadCaptureInput) => Promise<LeadCaptureResponse>;
  turnstileSiteKey?: string;
  Verification: ComponentType<{
    siteKey: string;
    onToken: (token: string | null) => void;
  }>;
};
const Context = createContext<LeadServices | null>(null);
export const LeadServicesProvider = Context.Provider;
export function useLeadServices(override?: LeadServices) {
  const context = useContext(Context);
  const services = override ?? context;
  if (!services) throw new Error("Lead transport is required");
  return services;
}
