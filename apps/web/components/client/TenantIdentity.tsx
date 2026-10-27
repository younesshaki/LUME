"use client";
// A small serialized prop also exercises tenant identity in React Flight.
export default function TenantIdentity({ slug }: { slug: string }) {
  return <p data-testid="flight-tenant">Preview identity: {slug}</p>;
}
