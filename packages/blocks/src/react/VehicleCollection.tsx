import type { ReactNode, Ref, KeyboardEventHandler } from "react";
import type { PageBlock, Vehicle } from "@lume/types";
import { DealershipSection, DealershipActionLink } from "./DealershipSection";
import { ArrowRight } from "lucide-react";
import { stringProp } from "./props";
export function VehicleCollectionView({
  block,
  collection,
  scrollerId,
  scrollerRef,
  controls,
  onKeyDown,
  cards,
  inventoryHref = "/vehicles",
  headingId,
}: {
  block: PageBlock;
  collection: { status: "loading" | "error" | "ready"; vehicles: unknown[] };
  scrollerId: string;
  scrollerRef?: Ref<HTMLDivElement>;
  controls?: ReactNode;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  cards?: ReactNode;
  inventoryHref?: string;
  headingId?: string;
}) {
  return (
    <DealershipSection
      headingId={headingId}
      block={block}
      className="dealershipBlock--vehicles"
      headerAside={controls}
    >
      {collection.status === "loading" ? (
        <p className="dealershipBlock__empty" role="status">
          Loading vehicles…
        </p>
      ) : collection.status === "error" ? (
        <p className="dealershipBlock__empty" role="alert">
          The live collection is temporarily unavailable.
        </p>
      ) : collection.vehicles.length === 0 ? (
        <p className="dealershipBlock__empty" role="status">
          No live vehicles match this selection yet.
        </p>
      ) : (
        <div
          id={scrollerId}
          ref={scrollerRef}
          className="vehicleCarousel"
          role="region"
          aria-label="Featured vehicles"
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          {cards}
        </div>
      )}
      <div className="dealershipBlock__footerAction">
        <DealershipActionLink href={inventoryHref} secondary>
          {stringProp(block, "ctaLabel")}
          <ArrowRight aria-hidden="true" />
        </DealershipActionLink>
      </div>
    </DealershipSection>
  );
}
