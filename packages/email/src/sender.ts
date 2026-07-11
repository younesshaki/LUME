import type {
  EmailTemplate,
  SendEmailInput,
  SendEmailResult,
} from "./types";
import { DEFAULT_EMAIL_FROM, readEmailProviderConfig, type EmailEnvironment } from "./config";
import {
  mailboxAddress,
  normalizeIdempotencyKey,
  normalizeRecipients,
  normalizeSubject,
  normalizeTags,
  normalizeTemplateKey,
  normalizeTenantEmailContext,
  senderMailbox,
} from "./validation";
import { renderEmailTemplate, type EmailTemplateRenderer } from "./render";
import { createResendTransport, type EmailTransport } from "./transport";

const MAX_RENDERED_HTML_BYTES = 2 * 1_024 * 1_024;
const MAX_RENDERED_TEXT_BYTES = 500 * 1_024;

export type CreateEmailSenderOptions = {
  environment?: EmailEnvironment;
  transport?: EmailTransport;
  defaultFrom?: string;
  renderer?: EmailTemplateRenderer;
  isRecipientSuppressed?: (recipient: string, tenantId: string) => Promise<boolean>;
};

export type EmailSender = <Props extends object>(
  input: SendEmailInput<Props>,
) => Promise<SendEmailResult>;

export function createEmailSender(options: CreateEmailSenderOptions = {}): EmailSender {
  const providerConfig = options.transport ? null : readEmailProviderConfig(options.environment);
  const transport = options.transport ?? (
    providerConfig ? createResendTransport(providerConfig.apiKey) : null
  );
  const defaultFrom = options.defaultFrom ?? providerConfig?.defaultFrom ?? DEFAULT_EMAIL_FROM;
  const renderer = options.renderer ?? renderEmailTemplate;

  return async <Props extends object>(input: SendEmailInput<Props>): Promise<SendEmailResult> => {
    if (!transport) return { status: "skipped", reason: "not_configured" };

    const validation = validateSendInput(input, defaultFrom);
    if (!validation.ok) return { status: "invalid", issues: validation.issues };

    let recipients = validation.recipients;
    if (options.isRecipientSuppressed) {
      try {
        const isRecipientSuppressed = options.isRecipientSuppressed;
        const checks = await Promise.all(recipients.map(async (recipient) => {
          const address = mailboxAddress(recipient);
          if (!address) throw new Error("Validated recipient has no mailbox address");
          return {
            recipient,
            suppressed: await isRecipientSuppressed(address, validation.tenant.id),
          };
        }));
        recipients = checks.filter((check) => !check.suppressed).map((check) => check.recipient);
      } catch {
        return {
          status: "failed",
          reason: "suppression_check_error",
          retryable: true,
        };
      }
      if (recipients.length === 0) return { status: "skipped", reason: "suppressed" };
    }

    let subject: string | null;
    let rendered: Awaited<ReturnType<EmailTemplateRenderer>>;
    try {
      subject = normalizeSubject(input.template.subject(input.props));
      if (!subject) return { status: "invalid", issues: ["subject"] };
      rendered = await renderer(input.template, input.props);
    } catch {
      return { status: "failed", reason: "render_error", retryable: false };
    }
    if (!validRenderedBody(rendered.html, MAX_RENDERED_HTML_BYTES) ||
      !validRenderedBody(rendered.text, MAX_RENDERED_TEXT_BYTES)) {
      return { status: "invalid", issues: ["rendered_body"] };
    }

    try {
      const result = await transport.send({
        from: validation.from,
        to: recipients,
        subject,
        html: rendered.html,
        text: rendered.text,
        ...(validation.tenant.replyTo ? { replyTo: validation.tenant.replyTo } : {}),
        tags: [
          { name: "tenant_id", value: validation.tenant.id },
          { name: "template", value: validation.templateKey },
          ...validation.tags,
        ],
        idempotencyKey: validation.idempotencyKey,
      });
      return result.ok
        ? { status: "sent", id: result.id, recipientCount: recipients.length }
        : {
            status: "failed",
            reason: "transport_error",
            code: result.code,
            retryable: result.retryable,
          };
    } catch {
      return { status: "failed", reason: "transport_error", retryable: true };
    }
  };
}

export async function sendEmail<Props extends object>(
  input: SendEmailInput<Props>,
  options: CreateEmailSenderOptions = {},
): Promise<SendEmailResult> {
  return createEmailSender(options)(input);
}

function validateSendInput<Props extends object>(
  input: SendEmailInput<Props>,
  defaultFrom: string,
):
  | {
      ok: true;
      tenant: NonNullable<ReturnType<typeof normalizeTenantEmailContext>>;
      recipients: string[];
      from: string;
      templateKey: string;
      idempotencyKey: string;
      tags: NonNullable<ReturnType<typeof normalizeTags>>;
    }
  | { ok: false; issues: string[] } {
  const issues: string[] = [];
  const tenant = normalizeTenantEmailContext(input.tenant);
  if (!tenant) issues.push("tenant");
  const recipients = normalizeRecipients(input.to);
  if (!recipients) issues.push("to");
  const templateKey = normalizeTemplateKey(input.template.key);
  if (!templateKey) issues.push("template");
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const requiredIdempotencyPrefix = tenant && templateKey
    ? `lume:${tenant.id}:${templateKey}:`
    : null;
  if (
    !idempotencyKey ||
    !requiredIdempotencyPrefix ||
    !idempotencyKey.startsWith(requiredIdempotencyPrefix) ||
    idempotencyKey.length === requiredIdempotencyPrefix.length
  ) issues.push("idempotency_key");
  const tags = normalizeTags(input.tags);
  if (!tags || tags.length > 8) issues.push("tags");

  let from: string | null = null;
  if (tenant) {
    from = tenant.fromAddress
      ? senderMailbox(tenant.name, tenant.fromAddress)
      : senderMailbox(tenant.name, defaultFrom);
    if (!from) issues.push("from");
  }
  return issues.length === 0 && tenant && recipients && from && templateKey && idempotencyKey && tags
    ? { ok: true, tenant, recipients, from, templateKey, idempotencyKey, tags }
    : { ok: false, issues };
}

function validRenderedBody(value: string, maxBytes: number): boolean {
  return value.trim().length > 0 && new TextEncoder().encode(value).byteLength <= maxBytes;
}
