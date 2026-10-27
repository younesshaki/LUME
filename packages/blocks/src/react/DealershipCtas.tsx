import { ArrowRight, MessageCircle } from "lucide-react";
import type { BlockComponentProps } from "./types";
import { DealershipActionLink, DealershipSection } from "./DealershipSection";
import { stringProp } from "./props";
import { safeLink, whatsappHref } from "../blockMedia";
export function WhatsAppCta({ block, sectionHeadingId }: BlockComponentProps) {
  const href = whatsappHref(
    stringProp(block, "phone"),
    stringProp(block, "message"),
  );

  return (
    <DealershipSection
      headingId={sectionHeadingId}
      block={block}
      className="dealershipBlock--cta"
      headerAside={<MessageCircle aria-hidden="true" />}
    >
      {href ? (
        <DealershipActionLink href={href}>
          {stringProp(block, "buttonLabel")}
          <ArrowRight aria-hidden="true" />
        </DealershipActionLink>
      ) : (
        <p className="dealershipBlock__empty" role="status">
          Add a valid international WhatsApp number to activate this block.
        </p>
      )}
    </DealershipSection>
  );
}
export function CtaBanner({ block, sectionHeadingId }: BlockComponentProps) {
  const primaryHref = safeLink(stringProp(block, "primaryHref"));
  const secondaryHref = safeLink(stringProp(block, "secondaryHref"));
  const primaryLabel = stringProp(block, "primaryLabel");
  const secondaryLabel = stringProp(block, "secondaryLabel");

  return (
    <DealershipSection
      headingId={sectionHeadingId}
      block={block}
      className="dealershipBlock--cta"
    >
      <div className="dealershipBlock__actions">
        {primaryHref && primaryLabel ? (
          <DealershipActionLink href={primaryHref}>
            {primaryLabel}
            <ArrowRight aria-hidden="true" />
          </DealershipActionLink>
        ) : null}
        {secondaryHref && secondaryLabel ? (
          <DealershipActionLink href={secondaryHref} secondary>
            {secondaryLabel}
          </DealershipActionLink>
        ) : null}
      </div>
    </DealershipSection>
  );
}
