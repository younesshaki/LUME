import type { LeadFormRequest } from "./leadAction";
import { publicPath } from "./publicPath";

export const LEAD_FORM_EVENT = "lume:concierge-lead-form";
const MAX_AGE = 5 * 60 * 1000;
type Pending = { request: LeadFormRequest; expires: number };
const memory = new Map<string, Pending>();
const key = (tenant: string) => `lume.web.pending-lead.v1.${tenant}`;

/** Tab/tenant-scoped, bounded-lived and one-shot. No PII in URLs/localStorage. */
export function queueLeadForm(tenant: string, request: LeadFormRequest): void {
  const pending = { request, expires: Date.now() + MAX_AGE };
  memory.set(tenant, pending);
  try {
    window.sessionStorage.setItem(key(tenant), JSON.stringify(pending));
  } catch {
    /* tab memory fallback */
  }
  window.dispatchEvent(new Event(LEAD_FORM_EVENT));
}

export function pendingLeadForm(
  tenant: string,
  path: string,
  handlerId: string,
  consume = false,
): LeadFormRequest | null {
  let pending = memory.get(tenant);
  try {
    const stored = window.sessionStorage.getItem(key(tenant));
    if (stored) pending = JSON.parse(stored);
  } catch {
    /* tab memory fallback */
  }
  if (
    !pending ||
    typeof pending.expires !== "number" ||
    pending.expires < Date.now()
  ) {
    clear(tenant);
    return null;
  }
  const request = pending.request;
  if (
    !request ||
    typeof request.path !== "string" ||
    publicPath(request.path) !== path ||
    request.handlerId !== handlerId ||
    !request.input ||
    typeof request.input !== "object"
  )
    return null;
  if (consume) clear(tenant);
  return request;
}

function clear(tenant: string) {
  memory.delete(tenant);
  try {
    window.sessionStorage.removeItem(key(tenant));
  } catch {
    /* memory cleared */
  }
}
