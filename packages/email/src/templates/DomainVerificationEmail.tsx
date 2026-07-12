import type { EmailTemplate } from "../types";
import { emailTextStyle, requireSafeActionUrl, TransactionalEmailLayout } from "./layout";

export type DomainVerificationEmailProps = {
  tenantName: string;
  domain: string;
  state: "verified" | "failed";
  domainsUrl: string;
};

export function DomainVerificationEmail({
  tenantName,
  domain,
  state,
  domainsUrl,
}: DomainVerificationEmailProps) {
  const actionUrl = requireSafeActionUrl(domainsUrl);
  const verified = state === "verified";
  return (
    <TransactionalEmailLayout
      preview={verified ? `${domain} is verified.` : `${domain} still needs DNS attention.`}
      heading={verified ? "Domain verified" : "Domain verification needs attention"}
      action={{ href: actionUrl, label: "Open domain settings" }}
    >
      <p style={emailTextStyle}>
        {verified
          ? `${domain} is verified and ready for ${tenantName}.`
          : `${domain} could not be verified within 24 hours for ${tenantName}.`}
      </p>
      {!verified ? (
        <p style={secondaryStyle}>
          Check that the exact DNS record shown in LUME is published without a proxy or typo,
          allow for DNS propagation, then run verification again from domain settings.
        </p>
      ) : null}
    </TransactionalEmailLayout>
  );
}

export const domainVerificationEmailTemplate: EmailTemplate<DomainVerificationEmailProps> = {
  key: "domain-verification",
  subject: ({ domain, state }) => state === "verified"
    ? `Domain verified: ${domain}`
    : `Domain verification needs attention: ${domain}`,
  render: (props) => <DomainVerificationEmail {...props} />,
};

const secondaryStyle = {
  ...emailTextStyle,
  color: "#c7bda8",
};
