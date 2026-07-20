import { Check, Quote, Star } from "lucide-react";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Marquee } from "@/components/ui/marquee";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { BlockComponentProps } from "../registry";
import { DealershipActionLink, DealershipSection } from "./DealershipSection";
import { labelBodyItemsProp, numberProp, stringProp } from "./props";
import {
  parseStatistic,
  safeLink,
  safeMediaSource,
  splitDelimitedValue,
} from "./dealershipBlockUtils";

export function Testimonials({ block }: BlockComponentProps) {
  const items = labelBodyItemsProp(block);
  return (
    <DealershipSection block={block} className="dealershipBlock--testimonials">
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

export function ReviewSummary({ block }: BlockComponentProps) {
  const rating = Math.min(5, Math.max(0, numberProp(block, "rating", 5)));
  const count = Math.max(0, Math.round(numberProp(block, "reviewCount")));
  const href = safeLink(stringProp(block, "sourceHref"));
  const sourceLabel = stringProp(block, "sourceLabel");

  return (
    <DealershipSection block={block} className="dealershipBlock--reviews">
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
          <DealershipActionLink href={href} secondary>{sourceLabel}</DealershipActionLink>
        ) : null}
      </div>
    </DealershipSection>
  );
}

export function TrustStats({ block }: BlockComponentProps) {
  const items = labelBodyItemsProp(block);
  return (
    <DealershipSection block={block} className="dealershipBlock--stats">
      <dl className="trustStats">
        {items.map((item, index) => {
          const statistic = parseStatistic(item.body);
          const accessibleValue = `${Intl.NumberFormat(undefined, {
            minimumFractionDigits: statistic.decimalPlaces,
            maximumFractionDigits: statistic.decimalPlaces,
          }).format(statistic.value)}${statistic.suffix}`;
          return (
            <div key={`${item.label}-${index}`}>
              <dt>{item.label}</dt>
              <dd aria-label={accessibleValue}>
                <NumberTicker
                  aria-hidden="true"
                  value={statistic.value}
                  decimalPlaces={statistic.decimalPlaces}
                />
                <span aria-hidden="true">{statistic.suffix}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </DealershipSection>
  );
}

export function LogoMarquee({ block }: BlockComponentProps) {
  const items = labelBodyItemsProp(block);
  return (
    <DealershipSection block={block} className="dealershipBlock--logos">
      <Marquee
        className="logoMarquee"
        pauseOnHover
        repeat={4}
        role="region"
        aria-label="Dealership partners"
      >
        {items.map((item, index) => {
          const src = item.body.toLowerCase() === "text"
            ? undefined
            : safeMediaSource(item.body);
          return (
            <div className="logoMarquee__item" key={`${item.label}-${index}`}>
              {src ? (
                <img src={src} alt={item.label} loading="lazy" decoding="async" />
              ) : (
                <span>{item.label}</span>
              )}
            </div>
          );
        })}
      </Marquee>
    </DealershipSection>
  );
}

export function ServicesList({ block }: BlockComponentProps) {
  const items = labelBodyItemsProp(block);
  return (
    <DealershipSection block={block} className="dealershipBlock--services">
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

export function HowItWorks({ block }: BlockComponentProps) {
  const items = labelBodyItemsProp(block);
  return (
    <DealershipSection block={block} className="dealershipBlock--steps">
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

export function FaqAccordion({ block }: BlockComponentProps) {
  const items = labelBodyItemsProp(block);
  return (
    <DealershipSection block={block} className="dealershipBlock--faq">
      <Accordion className="faqAccordion">
        {items.map((item, index) => (
          <AccordionItem
            value={`${block.id}-faq-${index}`}
            key={`${item.label}-${index}`}
            className="faqAccordion__item"
          >
            <AccordionTrigger className="faqAccordion__trigger">
              {item.label}
            </AccordionTrigger>
            <AccordionContent className="faqAccordion__content">
              <p>{item.body}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </DealershipSection>
  );
}

export function TeamGrid({ block }: BlockComponentProps) {
  const items = labelBodyItemsProp(block);
  return (
    <DealershipSection block={block} className="dealershipBlock--team">
      <div className="teamGrid">
        {items.map((item, index) => {
          const { first: role, second: biography } = splitDelimitedValue(item.body);
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
