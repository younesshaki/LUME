import type { Metadata } from "next";
import { requestTenant } from "../../server/tenant";
import TenantIdentity from "../../components/client/TenantIdentity";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<{ tenant?: string | string[] }> };
export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const tenant = await requestTenant((await searchParams).tenant);
  return {
    title: `${tenant.name} | LUME foundation preview`,
    description: `Read-only tenant preview for ${tenant.name}.`,
    alternates: { canonical: tenant.canonical },
  };
}
export default async function Preview({ searchParams }: Props) {
  const tenant = await requestTenant((await searchParams).tenant);
  return (
    <main>
      <p>Phase 1 · isolated, read-only, noindex</p>
      <h1>{tenant.name}</h1>
      <dl>
        <dt>Tenant</dt>
        <dd data-testid="tenant-slug">{tenant.slug}</dd>
        <dt>Resolution</dt>
        <dd>{tenant.source}</dd>
      </dl>
      <TenantIdentity slug={tenant.slug} />
      <p>
        <a href={`/vehicles?tenant=${encodeURIComponent(tenant.slug)}`}>
          Browse preview inventory
        </a>
      </p>
      <p>
        Vehicle inventory and detail are available in the isolated preview. Live
        routing, chat, forms, page-builder and cinema remain unchanged.
      </p>
    </main>
  );
}
