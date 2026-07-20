import { useId, type ReactNode } from "react";
import type { PageBlock } from "@lume/types";
import { stringProp } from "./props";
import "./DealershipBlocks.css";

export function DealershipSection({
  block,
  className,
  children,
  headerAside,
}: {
  block: PageBlock;
  className?: string;
  children: ReactNode;
  headerAside?: ReactNode;
}) {
  const headingId = useId();
  const eyebrow = stringProp(block, "eyebrow");
  const title = stringProp(block, "title");
  const body = stringProp(block, "body");

  return (
    <section
      className={["dealershipBlock", className].filter(Boolean).join(" ")}
      aria-labelledby={headingId}
    >
      <div className="dealershipBlock__inner">
        <header className="dealershipBlock__header">
          <div className="dealershipBlock__headingCopy">
            {eyebrow ? <p className="dealershipBlock__eyebrow">{eyebrow}</p> : null}
            <h2 id={headingId} className="dealershipBlock__title">{title}</h2>
            {body ? <p className="dealershipBlock__body">{body}</p> : null}
          </div>
          {headerAside}
        </header>
        {children}
      </div>
    </section>
  );
}

export function DealershipActionLink({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <a
      className={`dealershipBlock__action${secondary ? " dealershipBlock__action--secondary" : ""}`}
      href={href}
    >
      {children}
    </a>
  );
}
