import type { Metadata } from "next";
import VehicleInquiry from "../../../components/concierge/VehicleInquiry";
import { vehiclePage } from "../../../server/vehicles/page-data";
import {
  canonicalFor,
  priceLabel,
  vehiclePath,
  vehicleTitle,
} from "../../../server/vehicles/presentation";
import OptionalTools from "../../../components/vehicles/OptionalTools";
import GalleryEnhancement from "../../../components/vehicles/GalleryEnhancement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Props = {
  params: Promise<{ vehicleId: string }>;
  searchParams: Promise<{ tenant?: string | string[] }>;
};
async function load(props: Props) {
  return vehiclePage(
    (await props.params).vehicleId,
    (await props.searchParams).tenant,
  );
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { tenant, vehicle: v, images } = await load(props);
  const title = `${vehicleTitle(v)} | ${tenant.name}`;
  const description = `${vehicleTitle(v)} at ${tenant.name}. ${priceLabel(v.price)}. View photos, specifications and availability.`;
  const url = canonicalFor(tenant, `/vehicles/${v.id}`);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      ...(images[0]
        ? {
            images: [
              { url: images[0].src, alt: images[0].alt ?? vehicleTitle(v) },
            ],
          }
        : {}),
    },
  };
}
export default async function VehicleDetail(props: Props) {
  const { tenant, vehicle: v, images, priceSignal } = await load(props);
  const title = vehicleTitle(v);
  const contact = process.env.WEB_PREVIEW_CONTACT_URL;
  // Only an explicitly configured staging HTTP(S) destination; no invented phone/email or lead writes.
  let contactUrl: string | undefined;
  if (contact) {
    const u = new URL(contact);
    if (u.protocol === "https:" && !u.username && !u.password) {
      u.searchParams.set("tenant", tenant.slug);
      u.searchParams.set("vehicleId", v.id);
      contactUrl = u.href;
    }
  }
  const specs = [
    ["Year", v.year],
    ["Make", v.make],
    ["Model", v.model],
    ["Trim", v.trim],
    [
      "Mileage",
      v.mileage === null
        ? "Not provided"
        : `${v.mileage.toLocaleString("en-US")} miles`,
    ],
    ["Stock type", v.stockType],
    ["Body style", v.bodyStyle],
    ["Exterior", v.exteriorColor],
    ["Interior", v.interiorColor],
    ["Drivetrain", v.drivetrain],
    ["Fuel", v.fuelType],
    ["Location", [v.sellerCity, v.sellerState].filter(Boolean).join(", ")],
  ];
  return (
    <main className="vehicle-page">
      <nav aria-label="Breadcrumb">
        <a href={`/vehicles?tenant=${encodeURIComponent(tenant.slug)}`}>
          {tenant.name} inventory
        </a>
      </nav>
      <p className="preview-banner">Staging preview · read-only · noindex</p>
      <header>
        <p>{v.stockType} · Available</p>
        <h1>{title}</h1>
        <p className="price">{priceLabel(v.price)}</p>
        {priceSignal.enabled && priceSignal.reductions > 0 && (
          <p>
            Price reduced {priceSignal.reductions}{" "}
            {priceSignal.reductions === 1 ? "time" : "times"} in the last 30
            days
          </p>
        )}
        <a className="button primary" href="#availability">
          Check availability
        </a>
      </header>
      <section aria-label="Vehicle photographs" className="gallery">
        {images.length ? (
          images.map((image, i) => (
            <figure id={`photo-${i + 1}`} key={image.src}>
              <a href={image.src} target="_blank" rel="noreferrer">
                <img
                  src={image.src}
                  alt={image.alt ?? `${title} — photo ${i + 1}`}
                  width={1200}
                  height={800}
                  loading={i === 0 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : "auto"}
                />
              </a>
              <figcaption>
                Photo {i + 1} of {images.length}
              </figcaption>
            </figure>
          ))
        ) : (
          <p className="image-fallback">
            Photos coming soon. Vehicle specifications and availability are
            below.
          </p>
        )}
      </section>
      {images.length > 0 && (
        <GalleryEnhancement
          images={images.map((i) => ({ src: i.src, alt: i.alt ?? title }))}
        />
      )}
      <section aria-labelledby="specifications">
        <h2 id="specifications">Specifications</h2>
        <dl className="specs">
          {specs.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || "Not provided"}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section id="availability" aria-labelledby="availability-heading">
        <h2 id="availability-heading">Ask about this vehicle</h2>
        <p>
          Contact {tenant.name} about the {title}. Availability and estimated
          pricing must be confirmed with the dealer.
        </p>
        <p>
          Vehicle reference: <code>{v.id}</code>
        </p>
        <VehicleInquiry
          tenant={tenant.slug}
          vehicleId={v.id}
          title={title}
          siteKey={process.env.WEB_PREVIEW_TURNSTILE_SITE_KEY}
        />
        {contactUrl ? (
          <a className="button primary" href={contactUrl}>
            Contact dealer
          </a>
        ) : (
          <p>Use Request information above to contact the dealership.</p>
        )}
      </section>
      <OptionalTools title={title} vehicleId={v.id} tenant={tenant.slug} />
      <p>
        <a href={vehiclePath(v.id, tenant.slug)}>Permanent vehicle link</a>
      </p>
    </main>
  );
}
