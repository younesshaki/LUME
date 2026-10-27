import type { CSSProperties, ReactNode, MouseEventHandler } from "react";
import type { Vehicle } from "@lume/types";
import { MakeLogo } from "./MakeLogo";
function formatMileage(miles: number | null): string {
  if (miles === null) return "N/A";
  if (miles === 0) return "New";
  return `${miles.toLocaleString()} mi`;
}
export function MarketplaceCardView({
  vehicle,
  image,
  price,
  cardStyle,
  cardColor,
  index,
  actions,
  onHover,
  onMouseMove,
}: {
  vehicle: Omit<Vehicle, "tenantId" | "status" | "soldAt" | "soldPrice">;
  image?: string;
  price: string;
  cardStyle: "classic" | "notch" | "bento";
  cardColor: string;
  index: number;
  actions: ReactNode;
  onHover?: () => void;
  onMouseMove?: MouseEventHandler<HTMLElement>;
}) {
  const isBentoFeatured = cardStyle === "bento" && index % 5 === 4;
  return (
    <article
      className={[
        "vehiclesPage__card",
        cardStyle === "notch" && "vehiclesPage__card--notch",
        cardStyle === "bento" && "vehiclesPage__card--bento",
        isBentoFeatured && "vehiclesPage__card--bento-featured",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        cardStyle === "notch" || cardStyle === "bento"
          ? ({ "--vehicle-card-accent": cardColor } as CSSProperties &
              Record<"--vehicle-card-accent", string>)
          : undefined
      }
      onMouseEnter={onHover}
      onMouseMove={onMouseMove}
    >
      <div className="vehiclesPage__cardImage">
        {image ? (
          <img
            src={image}
            alt={
              vehicle.primaryImageAlt ||
              `${vehicle.year} ${vehicle.make} ${vehicle.model}`
            }
          />
        ) : (
          <div className="vehiclesPage__cardImagePlaceholder">
            <span>{vehicle.make}</span>
          </div>
        )}
        {vehicle.isSpecial && (
          <span className="vehiclesPage__badge vehiclesPage__badge--special">
            Special
          </span>
        )}
        <span
          className={`vehiclesPage__badge vehiclesPage__badge--${vehicle.stockType.toLowerCase()} ${vehicle.isSpecial ? "vehiclesPage__badge--stockOffset" : ""}`}
        >
          {vehicle.stockType}
        </span>
      </div>

      <div className="vehiclesPage__cardBody">
        <p className="vehiclesPage__cardYear">{vehicle.year}</p>
        <h2 className="vehiclesPage__cardTitle">
          {/* Decorative: the make is written immediately after it. */}
          <MakeLogo
            make={vehicle.make}
            size={22}
            className="vehiclesPage__cardMark"
          />
          {vehicle.make} {vehicle.model}
        </h2>
        {vehicle.trim && (
          <p className="vehiclesPage__cardTrim">{vehicle.trim}</p>
        )}
      </div>

      <div className="vehiclesPage__cardMeta" aria-label="Vehicle details">
        <span className="vehiclesPage__cardStat">
          {formatMileage(vehicle.mileage)}
        </span>
        {vehicle.fuelType && (
          <span className="vehiclesPage__cardStat">{vehicle.fuelType}</span>
        )}
        {vehicle.drivetrain && (
          <span className="vehiclesPage__cardStat">{vehicle.drivetrain}</span>
        )}
      </div>

      <div className="vehiclesPage__cardFooter">
        <span className="vehiclesPage__cardPrice">{price}</span>
        {vehicle.sellerCity && (
          <span className="vehiclesPage__cardLocation">
            {vehicle.sellerCity}, {vehicle.sellerState}
          </span>
        )}
      </div>

      {actions}
    </article>
  );
}
