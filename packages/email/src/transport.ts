import { Resend, type CreateEmailOptions, type CreateEmailRequestOptions } from "resend";
import type { EmailTag } from "./types";

export type EmailTransportMessage = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags: EmailTag[];
  idempotencyKey: string;
};

export type EmailTransportResult =
  | { ok: true; id: string }
  | { ok: false; code: string; retryable: boolean };

export type EmailTransport = {
  send(message: EmailTransportMessage): Promise<EmailTransportResult>;
};

type ResendEmailClient = {
  emails: {
    send(
      payload: CreateEmailOptions,
      options?: CreateEmailRequestOptions,
    ): ReturnType<Resend["emails"]["send"]>;
  };
};

export function createResendTransport(
  apiKey: string,
  client: ResendEmailClient = new Resend(apiKey),
): EmailTransport {
  return {
    async send(message) {
      const result = await client.emails.send({
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        ...(message.tags.length > 0 ? { tags: message.tags } : {}),
      }, { idempotencyKey: message.idempotencyKey });
      if (result.error) {
        return {
          ok: false,
          code: result.error.name,
          retryable: isRetryableResendError(result.error.name),
        };
      }
      return { ok: true, id: result.data.id };
    },
  };
}

function isRetryableResendError(code: string): boolean {
  return code === "rate_limit_exceeded" ||
    code === "concurrent_idempotent_requests" ||
    code === "application_error" ||
    code === "internal_server_error";
}
