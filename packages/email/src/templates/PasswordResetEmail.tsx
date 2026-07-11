import type { EmailTemplate } from "../types";
import { emailTextStyle, TransactionalEmailLayout } from "./layout";

export type PasswordResetEmailProps = {
  resetUrl: string;
  expiresInMinutes?: number | null;
};

export function PasswordResetEmail({
  resetUrl,
  expiresInMinutes,
}: PasswordResetEmailProps) {
  const expiry = normalizeExpiryMinutes(expiresInMinutes);
  return (
    <TransactionalEmailLayout
      preview="Use this secure link to reset your LUME password."
      heading="Reset your password"
      action={{ href: resetUrl, label: "Reset your password" }}
      footer="If you did not request this password reset, you can safely ignore this email."
    >
      <p style={emailTextStyle}>
        We received a request to reset the password for your LUME account.
        {expiry
          ? ` This link expires in ${expiry} minutes.`
          : " For your security, this link expires after a short time."}
      </p>
    </TransactionalEmailLayout>
  );
}

export const passwordResetEmailTemplate: EmailTemplate<PasswordResetEmailProps> = {
  key: "password-reset",
  subject: () => "Reset your LUME password",
  render: (props) => <PasswordResetEmail {...props} />,
};

function normalizeExpiryMinutes(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 24 * 60) {
    throw new Error("Password reset expiry must be between 1 and 1440 minutes");
  }
  return value;
}
