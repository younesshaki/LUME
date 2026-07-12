import type { EmailTemplate } from "../types";
import { LeadSummary, type LeadEmailSummary } from "./LeadCreatedEmail";
import { emailTextStyle, requireSafeActionUrl, TransactionalEmailLayout } from "./layout";

export type LeadDigestEmailProps = {
  tenantName: string;
  leadsUrl: string;
  leads: readonly LeadEmailSummary[];
};

export function LeadDigestEmail({ tenantName, leadsUrl, leads }: LeadDigestEmailProps) {
  const safeLeadsUrl = requireSafeActionUrl(leadsUrl);
  if (leads.length < 1 || leads.length > 100) {
    throw new Error("Lead digest must contain between 1 and 100 leads");
  }
  return (
    <TransactionalEmailLayout
      preview={`${leads.length} new lead${leads.length === 1 ? "" : "s"} for ${tenantName}.`}
      heading={`${leads.length} new lead${leads.length === 1 ? "" : "s"}`}
      action={{ href: safeLeadsUrl, label: "Open lead inbox" }}
    >
      <p style={emailTextStyle}>
        Here is your hourly lead digest for <strong>{tenantName}</strong>.
      </p>
      {leads.map((lead, index) => (
        <div key={`${lead.leadUrl}:${index}`}>
          <LeadSummary lead={lead} />
          <p style={leadLinkStyle}>
            <a href={requireSafeActionUrl(lead.leadUrl)} style={linkStyle}>
              Open this lead
            </a>
          </p>
        </div>
      ))}
    </TransactionalEmailLayout>
  );
}

export const leadDigestEmailTemplate: EmailTemplate<LeadDigestEmailProps> = {
  key: "lead-digest",
  subject: ({ tenantName, leads }) =>
    `${leads.length} new lead${leads.length === 1 ? "" : "s"} for ${tenantName}`,
  render: (props) => <LeadDigestEmail {...props} />,
};

const leadLinkStyle = {
  ...emailTextStyle,
  fontSize: "13px",
  margin: "-8px 0 24px",
};

const linkStyle = {
  color: "#d9b76a",
  textDecoration: "underline",
};
