"use client";
import { Check, Quote, Star } from "lucide-react";
import { NumberTicker } from "./NumberTicker";
import { Marquee } from "./Marquee";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./Accordion";
import type { BlockComponentProps } from "./types";
import { DealershipActionLink, DealershipSection } from "./DealershipSection";
import { labelBodyItemsProp, numberProp, stringProp } from "./props";
import {
  parseStatistic,
  safeLink,
  safeMediaSource,
  splitDelimitedValue,
} from "../blockMedia";

export function TrustStats({
  block,
  sectionHeadingId,
  animateNumbers = true,
}: BlockComponentProps & { animateNumbers?: boolean }) {
  const items = labelBodyItemsProp(block);
  return (
    <DealershipSection
      headingId={sectionHeadingId}
      block={block}
      className="dealershipBlock--stats"
    >
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
                {animateNumbers ? (
                  <NumberTicker
                    aria-hidden="true"
                    value={statistic.value}
                    decimalPlaces={statistic.decimalPlaces}
                  />
                ) : (
                  <span>
                    {Intl.NumberFormat(undefined, {
                      minimumFractionDigits: statistic.decimalPlaces,
                      maximumFractionDigits: statistic.decimalPlaces,
                    }).format(statistic.value)}
                  </span>
                )}
                <span aria-hidden="true">{statistic.suffix}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </DealershipSection>
  );
}

export function LogoMarquee({
  block,
  sectionHeadingId,
  mediaSource,
  mediaBase,
}: BlockComponentProps & {
  mediaSource?: (value: string) => string | undefined;
  mediaBase?: string;
}) {
  const items = labelBodyItemsProp(block);
  return (
    <DealershipSection
      headingId={sectionHeadingId}
      block={block}
      className="dealershipBlock--logos"
    >
      <Marquee
        className="logoMarquee"
        pauseOnHover
        repeat={4}
        role="region"
        aria-label="Dealership partners"
      >
        {items.map((item, index) => {
          const src =
            item.body.toLowerCase() === "text"
              ? undefined
              : mediaSource
                ? mediaSource(item.body)
                : safeMediaSource(item.body, (key) =>
                    mediaBase ? `${mediaBase.replace(/\/$/, "")}/${key}` : key,
                  );
          return (
            <div className="logoMarquee__item" key={`${item.label}-${index}`}>
              {src ? (
                <img
                  src={src}
                  alt={item.label}
                  loading="lazy"
                  decoding="async"
                />
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

export function FaqAccordion({
  block,
  sectionHeadingId,
  progressive = false,
}: BlockComponentProps & { progressive?: boolean }) {
  const Root = progressive ? NativeRoot : Accordion,
    Item = progressive ? NativeItem : AccordionItem,
    Trigger = progressive ? NativeTrigger : AccordionTrigger,
    Content = progressive ? NativeContent : AccordionContent;
  const items = labelBodyItemsProp(block);
  return (
    <DealershipSection
      headingId={sectionHeadingId}
      block={block}
      className="dealershipBlock--faq"
    >
      <Root className="faqAccordion">
        {items.map((item, index) => (
          <Item
            value={`${block.id}-faq-${index}`}
            key={`${item.label}-${index}`}
            className="faqAccordion__item"
          >
            <Trigger className="faqAccordion__trigger">{item.label}</Trigger>
            <Content className="faqAccordion__content">
              <p>{item.body}</p>
            </Content>
          </Item>
        ))}
      </Root>
    </DealershipSection>
  );
}

type NativeProps = {
  children?: import("react").ReactNode;
  className?: string;
  value?: string;
};
function NativeRoot({ children, className }: NativeProps) {
  return <div className={className}>{children}</div>;
}
function NativeItem({ children, className }: NativeProps) {
  return <details className={className}>{children}</details>;
}
function NativeTrigger({ children, className }: NativeProps) {
  return <summary className={className}>{children}</summary>;
}
function NativeContent({ children, className }: NativeProps) {
  return <div className={className}>{children}</div>;
}
