import type { EmailIdempotencyInput, EmailTag, TenantEmailContext } from "./types";

const EMAIL_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const SAFE_KEY_PART_PATTERN = /^[A-Za-z0-9._-]+$/;
const SAFE_TAG_PATTERN = /^[A-Za-z0-9_-]+$/;
const RESERVED_TAG_NAMES = new Set(["tenant_id", "template"]);

export const MAX_EMAIL_RECIPIENTS = 50;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

export function normalizeMailbox(value: string): string | null {
  const normalized = value.trim();
  if (!normalized || normalized.length > 320 || /[\r\n]/.test(normalized)) return null;
  const displayMatch = /^([^<>]*)<([^<>]+)>$/.exec(normalized);
  if (!displayMatch) return EMAIL_PATTERN.test(normalized) ? normalized : null;
  const name = displayMatch[1].trim();
  const email = displayMatch[2].trim();
  if (!name || name.length > 100 || !EMAIL_PATTERN.test(email)) return null;
  return `${name} <${email}>`;
}

export function normalizeRecipients(value: string | readonly string[]): string[] | null {
  const raw = typeof value === "string" ? [value] : [...value];
  if (raw.length < 1 || raw.length > MAX_EMAIL_RECIPIENTS) return null;
  const recipients: string[] = [];
  const seen = new Set<string>();
  for (const candidate of raw) {
    const normalized = normalizeMailbox(candidate);
    if (!normalized) return null;
    const dedupeKey = mailboxAddress(normalized);
    if (!dedupeKey) return null;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    recipients.push(normalized);
  }
  return recipients.length > 0 ? recipients : null;
}

export function mailboxAddress(value: string): string | null {
  const normalized = normalizeMailbox(value);
  if (!normalized) return null;
  const displayMatch = /^([^<>]*)<([^<>]+)>$/.exec(normalized);
  return (displayMatch ? displayMatch[2] : normalized).trim().toLowerCase();
}

export function normalizeSubject(value: string): string | null {
  if (/[\r\n]/.test(value)) return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized && normalized.length <= 200 ? normalized : null;
}

export function normalizeTenantEmailContext(value: TenantEmailContext): TenantEmailContext | null {
  const id = value.id.trim();
  const name = value.name.trim().replace(/\s+/g, " ");
  if (
    !id ||
    id.length > 100 ||
    !SAFE_KEY_PART_PATTERN.test(id) ||
    !name ||
    name.length > 100 ||
    /[\r\n<>]/.test(name)
  ) {
    return null;
  }
  const fromAddress = value.fromAddress?.trim() || null;
  const replyTo = value.replyTo?.trim() || null;
  if (fromAddress !== null && !normalizeMailbox(fromAddress)) return null;
  if (replyTo !== null && !normalizeMailbox(replyTo)) return null;
  return { id, name, fromAddress, replyTo };
}

export function normalizeTemplateKey(value: string): string | null {
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= 80 && SAFE_KEY_PART_PATTERN.test(normalized)
    ? normalized
    : null;
}

export function normalizeIdempotencyKey(value: string): string | null {
  const normalized = value.trim();
  return normalized.length >= 1 &&
    normalized.length <= MAX_IDEMPOTENCY_KEY_LENGTH &&
    /^[A-Za-z0-9:._-]+$/.test(normalized)
    ? normalized
    : null;
}

export function emailIdempotencyKey(input: EmailIdempotencyInput): string | null {
  const tenantId = input.tenantId.trim();
  const templateKey = input.templateKey.trim();
  const entityId = input.entityId.trim();
  if (
    !tenantId ||
    !templateKey ||
    !entityId ||
    !SAFE_KEY_PART_PATTERN.test(tenantId) ||
    !SAFE_KEY_PART_PATTERN.test(templateKey) ||
    !SAFE_KEY_PART_PATTERN.test(entityId)
  ) return null;
  return normalizeIdempotencyKey(`lume:${tenantId}:${templateKey}:${entityId}`);
}

export function normalizeTags(value: readonly EmailTag[] | undefined): EmailTag[] | null {
  if (!value) return [];
  if (value.length > 8) return null;
  const tags: EmailTag[] = [];
  const seen = new Set<string>();
  for (const tag of value) {
    const name = tag.name.trim();
    const tagValue = tag.value.trim();
    const dedupeKey = name.toLowerCase();
    if (
      !name ||
      name.length > 50 ||
      !SAFE_TAG_PATTERN.test(name) ||
      RESERVED_TAG_NAMES.has(dedupeKey) ||
      seen.has(dedupeKey) ||
      !tagValue ||
      tagValue.length > 256 ||
      !SAFE_TAG_PATTERN.test(tagValue)
    ) return null;
    seen.add(dedupeKey);
    tags.push({ name, value: tagValue });
  }
  return tags;
}

export function senderMailbox(tenantName: string, addressOrMailbox: string): string | null {
  const normalized = normalizeMailbox(addressOrMailbox);
  if (!normalized) return null;
  if (normalized.includes("<")) return normalized;
  const name = tenantName.trim().replace(/\s+/g, " ");
  if (!name || name.length > 100 || /[\r\n<>]/.test(name)) return null;
  const escapedName = name.replace(/(["\\])/g, "\\$1");
  return `"${escapedName}" <${normalized}>`;
}
