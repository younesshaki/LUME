import type { ReactNode } from "react";

export type EmailTemplate<Props extends object> = {
  /** Stable provider/audit key, never localized or derived from recipient data. */
  key: string;
  subject: (props: Props) => string;
  render: (props: Props) => ReactNode;
};

export type TenantEmailContext = {
  id: string;
  name: string;
  /** Trusted server-side override loaded from tenant_settings. */
  fromAddress?: string | null;
  replyTo?: string | null;
};

export type EmailTag = {
  name: string;
  value: string;
};

export type SendEmailInput<Props extends object> = {
  tenant: TenantEmailContext;
  to: string | readonly string[];
  template: EmailTemplate<Props>;
  props: Props;
  /** Required retry key. Do not include recipient addresses or other PII. */
  idempotencyKey: string;
  tags?: readonly EmailTag[];
};

export type SendEmailResult =
  | { status: "sent"; id: string; recipientCount: number }
  | { status: "skipped"; reason: "not_configured" | "suppressed" }
  | { status: "invalid"; issues: readonly string[] }
  | {
      status: "failed";
      reason: "render_error" | "transport_error" | "suppression_check_error";
      code?: string;
      retryable: boolean;
    };

export type EmailIdempotencyInput = {
  tenantId: string;
  templateKey: string;
  entityId: string;
};
