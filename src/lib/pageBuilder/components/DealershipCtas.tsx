import { useEffect, useId, useState } from "react";
import { ArrowRight, MessageCircle, X } from "lucide-react";
import type { BlockComponentProps } from "../registry";
import { DealershipActionLink, DealershipSection } from "./DealershipSection";
import { booleanProp, stringProp } from "./props";
import { safeLink, whatsappHref } from "./dealershipBlockUtils";

export function WhatsAppCta({ block }: BlockComponentProps) {
  const href = whatsappHref(
    stringProp(block, "phone"),
    stringProp(block, "message"),
  );

  return (
    <DealershipSection
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

export function CtaBanner({ block }: BlockComponentProps) {
  const primaryHref = safeLink(stringProp(block, "primaryHref"));
  const secondaryHref = safeLink(stringProp(block, "secondaryHref"));
  const primaryLabel = stringProp(block, "primaryLabel");
  const secondaryLabel = stringProp(block, "secondaryLabel");

  return (
    <DealershipSection block={block} className="dealershipBlock--cta">
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

export function AnnouncementBar({ block }: BlockComponentProps) {
  const [dismissed, setDismissed] = useState(false);
  const labelId = useId();
  const dismissible = booleanProp(block, "dismissible", true);
  const linkLabel = stringProp(block, "linkLabel");
  const href = safeLink(stringProp(block, "linkHref"));
  const message = stringProp(block, "message");

  useEffect(() => setDismissed(false), [dismissible, href, linkLabel, message]);

  if (dismissed) return null;

  return (
    <aside className="announcementBlock" aria-labelledby={labelId}>
      <div className="announcementBlock__inner">
        <p id={labelId}>{message}</p>
        {href && linkLabel ? (
          <a href={href}>
            {linkLabel}
            <ArrowRight aria-hidden="true" />
          </a>
        ) : null}
        {dismissible ? (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss announcement"
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </aside>
  );
}
