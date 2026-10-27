import type { Vehicle } from "@lume/types";
import { MakeLogo } from "./MakeLogo";
export function VehicleCardView({
  vehicle,
  image,
  price,
  href,
}: {
  vehicle: Omit<Vehicle,"tenantId"|"status"|"soldAt"|"soldPrice">;
  image: string;
  price: string;
  href: string;
}) {
  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  return (
    <article className="vehicleCarousel__card">
      <a href={href}>
        <div className="vehicleCarousel__media">
          {image ? (
            <img
              src={image}
              alt={vehicle.primaryImageAlt || vehicleName}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span aria-hidden="true">{vehicle.make}</span>
          )}
        </div>
        <div className="vehicleCarousel__copy">
          <p>{vehicle.year}</p>
          <h3 className="dealershipVehicleCard__title">
            <MakeLogo make={vehicle.make} size={18} />
            {vehicle.make} {vehicle.model}
          </h3>
          {vehicle.trim ? <span>{vehicle.trim}</span> : null}
          <strong>{price}</strong>
        </div>
      </a>
    </article>
  );
}
