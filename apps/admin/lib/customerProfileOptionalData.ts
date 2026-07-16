type RelationError = { code?: unknown; message?: unknown };

/**
 * Customer 360 can be deployed before the optional saved-vehicle/analytics
 * migrations. A missing relation must not prevent the established CRM profile
 * (visitor, leads, chats, and loyalty) from rendering.
 */
export function isMissingOptionalCustomerRelation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as RelationError;
  if (code === "42P01" || code === "42703" || code === "PGRST204" || code === "PGRST205") return true;
  return typeof message === "string" && /(?:relation|table|column).+(?:does not exist|could not find)/i.test(message);
}
