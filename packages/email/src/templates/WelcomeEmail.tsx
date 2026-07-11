import type { EmailTemplate } from "../types";
import { emailTextStyle, TransactionalEmailLayout } from "./layout";

export type WelcomeEmailProps = {
  tenantName: string;
  dashboardUrl: string;
};

const checklistStyle = {
  ...emailTextStyle,
  paddingLeft: "22px",
} as const;

export function WelcomeEmail({ tenantName, dashboardUrl }: WelcomeEmailProps) {
  return (
    <TransactionalEmailLayout
      preview={`Your LUME workspace for ${tenantName} is ready.`}
      heading={`Welcome to LUME, ${tenantName}`}
      action={{ href: dashboardUrl, label: "Continue setup" }}
    >
      <p style={emailTextStyle}>
        Your LUME workspace for <strong>{tenantName}</strong> is ready. You can now add
        inventory, shape your site, and invite the rest of your team. Your onboarding
        checklist starts with:
      </p>
      <ul style={checklistStyle}>
        <li>Upload logo</li>
        <li>Import first vehicles</li>
        <li>Configure bot persona</li>
        <li>Invite a team member</li>
        <li>Connect domain or publish</li>
      </ul>
    </TransactionalEmailLayout>
  );
}

export const welcomeEmailTemplate: EmailTemplate<WelcomeEmailProps> = {
  key: "welcome",
  subject: ({ tenantName }) => `Welcome to LUME — ${tenantName}`,
  render: (props) => <WelcomeEmail {...props} />,
};
