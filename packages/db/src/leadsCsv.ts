/**
 * Lead → CSV serialization for the admin bulk export (SCRUM-175, K-9).
 *
 * Pure and dependency-free so it can be unit-tested and reused anywhere. Two
 * concerns beyond "join with commas":
 *  1. RFC 4180 quoting — any field containing a comma, quote, or newline is
 *     wrapped in double quotes with internal quotes doubled.
 *  2. CSV-injection defense — lead names/messages are attacker-controllable
 *     (they come from public forms/chat). A field beginning with =, +, -, @ or
 *     a control char can execute as a formula when the file is opened in Excel
 *     or Sheets, so we prefix those with a single quote.
 */
import type { Database } from "./schema";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

/** Columns exported, in order. Header label → row accessor. */
const LEAD_CSV_COLUMNS: ReadonlyArray<{
  header: string;
  value: (lead: LeadRow) => unknown;
}> = [
  { header: "id", value: (l) => l.id },
  { header: "created_at", value: (l) => l.created_at },
  { header: "status", value: (l) => l.status },
  { header: "source", value: (l) => l.source },
  { header: "first_name", value: (l) => l.first_name },
  { header: "last_name", value: (l) => l.last_name },
  { header: "email", value: (l) => l.email },
  { header: "phone", value: (l) => l.phone },
  { header: "message", value: (l) => l.message },
  { header: "vehicle_id", value: (l) => l.vehicle_id },
  { header: "assigned_to", value: (l) => l.assigned_to },
  { header: "utm_source", value: (l) => l.utm_source },
  { header: "utm_medium", value: (l) => l.utm_medium },
  { header: "utm_campaign", value: (l) => l.utm_campaign },
  { header: "referrer", value: (l) => l.referrer },
  { header: "ip_addr", value: (l) => l.ip_addr },
  { header: "user_agent", value: (l) => l.user_agent },
  { header: "lost_reason", value: (l) => l.lost_reason },
];

/** Column headers, in export order — handy for tests and fixtures. */
export const LEAD_CSV_HEADERS: readonly string[] = LEAD_CSV_COLUMNS.map(
  (column) => column.header,
);

const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@"]);

/** Neutralize spreadsheet formula execution without altering the visible text. */
function neutralizeFormula(value: string): string {
  const first = value[0];
  if (first !== undefined && (FORMULA_TRIGGERS.has(first) || first === "\t" || first === "\r")) {
    return `'${value}`;
  }
  return value;
}

/** RFC 4180 quoting: quote when the field contains a comma, quote, CR or LF. */
function encodeField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = neutralizeFormula(String(value));
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/**
 * Serialize leads to an RFC 4180 CSV document (CRLF line endings, header row
 * first). Always emits the header, so an empty export is still a valid CSV.
 */
export function leadsToCsv(leads: readonly LeadRow[]): string {
  const lines: string[] = [LEAD_CSV_HEADERS.map(encodeField).join(",")];
  for (const lead of leads) {
    lines.push(LEAD_CSV_COLUMNS.map((column) => encodeField(column.value(lead))).join(","));
  }
  return lines.join("\r\n");
}
