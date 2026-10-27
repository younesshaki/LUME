import { Check, Quote, Star } from "lucide-react";
import type { BlockComponentProps } from "./types";
import { DealershipActionLink, DealershipSection } from "./DealershipSection";
import { labelBodyItemsProp, numberProp, stringProp } from "./props";
import { safeLink, splitDelimitedValue } from "../blockMedia";
export function Testimonials({ block, sectionHeadingId }: BlockComponentProps) {
  const items = labelBodyItemsProp(block);
  return (
    <DealershipSection
      headingId={sectionHeadingId}
      block={block}
      className="dealershipBlock--testimonials"
    >
      <div className="testimonialGrid">
        {items.map((item, index) => (
          <figure key={`${item.label}-${index}`}>
            <Quote aria-hidden="true" />
            <blockquote>{item.body}</blockquote>
            <figcaption>{item.label}</figcaption>
          </figure>
        ))}
      </div>
    </DealershipSection>
  );
}
export function ReviewSummary({
  block,
  sectionHeadingId,
}: BlockComponentProps) {
  const rating = Math.min(5, Math.max(0, numberProp(block, "rating", 5)));
  const count = Math.max(0, Math.round(numberProp(block, "reviewCount")));
  const href = safeLink(stringProp(block, "sourceHref"));
  const sourceLabel = stringProp(block, "sourceLabel");

  return (
    <DealershipSection
      headingId={sectionHeadingId}
      block={block}
      className="dealershipBlock--reviews"
    >
      <div
        className="reviewSummary"
        role="group"
        aria-label={`${rating.toFixed(1)} out of 5 from ${count.toLocaleString()} reviews`}
      >
        <div className="reviewSummary__score">
          <strong>{rating.toFixed(1)}</strong>
          <span>out of 5</span>
        </div>
        <div>
          <div className="reviewSummary__stars" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <Star
                key={index}
                fill={index + 1 <= Math.round(rating) ? "currentColor" : "none"}
              />
            ))}
          </div>
          <p>{count.toLocaleString()} verified reviews</p>
        </div>
        {href && sourceLabel ? (
          <DealershipActionLink href={href} secondary>
            {sourceLabel}
          </DealershipActionLink>
        ) : null}
      </div>
    </DealershipSection>
  );
}
export function ServicesList({ block, sectionHeadingId }: BlockComponentProps) {
  const items = labelBodyItemsProp(block);
  return (
    <DealershipSection
      headingId={sectionHeadingId}
      block={block}
      className="dealershipBlock--services"
    >
      <div className="serviceGrid">
        {items.map((item, index) => (
          <article key={`${item.label}-${index}`}>
            <Check aria-hidden="true" />
            <h3>{item.label}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
    </DealershipSection>
  );
}
export function HowItWorks({ block, sectionHeadingId }: BlockComponentProps) {
  const items = labelBodyItemsProp(block);
  return (
    <DealershipSection
      headingId={sectionHeadingId}
      block={block}
      className="dealershipBlock--steps"
    >
      <ol className="processSteps">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3>{item.label}</h3>
              <p>{item.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </DealershipSection>
  );
}
export function TeamGrid({ block, sectionHeadingId }: BlockComponentProps) {
  const items = labelBodyItemsProp(block);
  return (
    <DealershipSection
      headingId={sectionHeadingId}
      block={block}
      className="dealershipBlock--team"
    >
      <div className="teamGrid">
        {items.map((item, index) => {
          const { first: role, second: biography } = splitDelimitedValue(
            item.body,
          );
          return (
            <article key={`${item.label}-${index}`}>
              <div className="teamGrid__monogram" aria-hidden="true">
                {initials(item.label)}
              </div>
              <h3>{item.label}</h3>
              {role ? <p className="teamGrid__role">{role}</p> : null}
              {biography ? <p>{biography}</p> : null}
            </article>
          );
        })}
      </div>
    </DealershipSection>
  );
}
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
