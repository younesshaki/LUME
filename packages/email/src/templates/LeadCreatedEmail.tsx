import type { EmailTemplate } from "../types";
import { emailTextStyle, requireSafeActionUrl, TransactionalEmailLayout } from "./layout";

export type LeadEmailSummary = {
  contactName: string;
  email?: string | null;
  phone?: string | null;
  messagePreview?: string | null;
  source: string;
  vehicleLabel?: string | null;
  leadUrl: string;
};

export type LeadCreatedEmailProps = {
  tenantName: string;
  lead: LeadEmailSummary;
};

export function LeadCreatedEmail({ tenantName, lead }: LeadCreatedEmailProps) {
  const leadUrl = requireSafeActionUrl(lead.leadUrl);
  return (
    <TransactionalEmailLayout
      preview={`A new lead is waiting in ${tenantName}.`}
      heading={`New lead for ${tenantName}`}
      action={{ href: leadUrl, label: "Open lead in admin" }}
    >
      <LeadSummary lead={lead} />
    </TransactionalEmailLayout>
  );
}

export const leadCreatedEmailTemplate: EmailTemplate<LeadCreatedEmailProps> = {
  key: "lead-created",
  subject: ({ tenantName }) => `New lead for ${tenantName}`,
  render: (props) => <LeadCreatedEmail {...props} />,
};

export function LeadSummary({ lead }: { lead: LeadEmailSummary }) {
  return (
    <div style={summaryStyle}>
      <p style={emailTextStyle}><strong>{lead.contactName || "New enquiry"}</strong></p>
      <p style={detailStyle}>
        {lead.email ? `Email: ${lead.email}` : ""}
        {lead.email && lead.phone ? <br /> : null}
        {lead.phone ? `Phone: ${lead.phone}` : ""}
      </p>
      <p style={detailStyle}>Source: {lead.source}</p>
      {lead.vehicleLabel ? <p style={detailStyle}>Vehicle: {lead.vehicleLabel}</p> : null}
      {lead.messagePreview ? (
        <blockquote style={messageStyle}>{lead.messagePreview}</blockquote>
      ) : null}
    </div>
  );
}

const summaryStyle = {
  border: "1px solid #3a3328",
  borderRadius: "8px",
  margin: "0 0 18px",
  padding: "18px",
};

const detailStyle = {
  ...emailTextStyle,
  color: "#c7bda8",
  fontSize: "14px",
  lineHeight: "21px",
  margin: "0 0 8px",
};

const messageStyle = {
  ...emailTextStyle,
  borderLeft: "3px solid #d9b76a",
  color: "#c7bda8",
  margin: "14px 0 0",
  paddingLeft: "14px",
  whiteSpace: "pre-wrap" as const,
};
