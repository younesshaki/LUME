"use client";
import { useEffect, useId, useState } from "react";
import { ArrowRight, MessageCircle, X } from "lucide-react";
import type { BlockComponentProps } from "./types";
import { DealershipActionLink, DealershipSection } from "./DealershipSection";
import { booleanProp, stringProp } from "./props";
import { safeLink, whatsappHref } from "../blockMedia";

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
