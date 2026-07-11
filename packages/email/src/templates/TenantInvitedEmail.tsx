import type { EmailTemplate } from "../types";
import { emailTextStyle, TransactionalEmailLayout } from "./layout";

const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export type TenantInviteRole = "owner" | "admin" | "editor" | "viewer";

export type TenantInvitedEmailProps = {
  tenantName: string;
  inviteUrl: string;
  role: TenantInviteRole;
  expiresAt?: string | null;
};

export function TenantInvitedEmail({
  tenantName,
  inviteUrl,
  role,
  expiresAt,
}: TenantInvitedEmailProps) {
  const expiry = formatExpiry(expiresAt);
  return (
    <TransactionalEmailLayout
      preview={`You have been invited to join ${tenantName}.`}
      heading={`Join ${tenantName}`}
      action={{ href: inviteUrl, label: "Accept invitation" }}
      footer="This invitation is intended only for the email address it was sent to."
    >
      <p style={emailTextStyle}>
        You have been invited to join <strong>{tenantName}</strong> as {roleLabel(role)}.
        Use the email address that received this invitation to sign in or create your
        LUME account.
      </p>
      {expiry ? (
        <p style={emailTextStyle}>This invitation expires {expiry}.</p>
      ) : null}
    </TransactionalEmailLayout>
  );
}

export const tenantInvitedEmailTemplate: EmailTemplate<TenantInvitedEmailProps> = {
  key: "tenant-invited",
  subject: ({ tenantName }) => `You're invited to ${tenantName} on LUME`,
  render: (props) => <TenantInvitedEmail {...props} />,
};

function roleLabel(role: TenantInviteRole): string {
  switch (role) {
    case "owner":
      return "an owner";
    case "admin":
      return "an administrator";
    case "editor":
      return "an editor";
    case "viewer":
      return "a viewer";
  }
}

function formatExpiry(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  const normalized = value.trim();
  const parsed = new Date(normalized);
  if (!ISO_TIMESTAMP_PATTERN.test(normalized) || Number.isNaN(parsed.getTime())) {
    throw new Error("Invitation expiry must be an ISO timestamp");
  }
  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(parsed)} UTC`;
}
