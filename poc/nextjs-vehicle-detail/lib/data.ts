import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { selectTenant } from './tenant';

type Tenant = { id: string; slug: string; name: string; status: string };
type Vehicle = { id: string; tenant_id: string; year: number; make: string; model: string;
  trim: string; price: number; mileage: number | null; image_src: string; body_style: string };
type Image = { r2_key: string; ai_description: string | null };

async function db<T>(path: string, body?: object, privileged = false): Promise<T> {
  const key = privileged ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_ANON_KEY;
  if (!key || !process.env.SUPABASE_URL) throw new Error('POC Supabase configuration is missing');
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method: body ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`POC data request failed (${response.status})`);
  return response.json();
}

export const getDetail = cache(async (id: string, queryTenant: string | undefined) => {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) notFound();
  const host = (await headers()).get('host') ?? '';
  const slug = selectTenant(host, queryTenant, process.env.POC_ROOT_DOMAIN ?? 'lume.test',
    process.env.POC_DEFAULT_TENANT ?? 'default');
  if (!slug) notFound();
  const tenants = await db<Tenant[]>('rpc/tenant_by_slug', { p_slug: slug });
  const tenant = tenants[0];
  if (!tenant || tenant.status !== 'active') notFound();
  // Public visibility is established using anon + explicit tenant and status.
  const rows = await db<Vehicle[]>(`vehicles?select=id,tenant_id,year,make,model,trim,price,mileage,image_src,body_style&tenant_id=eq.${tenant.id}&id=eq.${id}&status=eq.live&limit=1`);
  const vehicle = rows[0];
  if (!vehicle) notFound();
  // Match the current API's bounded, server-only managed-gallery exception.
  const images = await db<Image[]>(`vehicle_images?select=r2_key,ai_description&tenant_id=eq.${tenant.id}&vehicle_id=eq.${id}&order=is_primary.desc,sort_order.asc,created_at.asc&limit=5`, undefined,
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, '');
  const image = images[0] && base ? `${base}/${images[0].r2_key.split('/').map(encodeURIComponent).join('/')}` : vehicle.image_src;
  if (!image || new URL(image).protocol !== 'https:') throw new Error('Selected vehicle needs a public HTTPS image');
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  const description = `${title}${vehicle.trim ? ` ${vehicle.trim}` : ''} for sale at ${tenant.name}. View photos, specifications and vehicle details.`;
  // Configured origin, never an arbitrary incoming Host. Query tenants stay in
  // localhost proof canonicals; production must use verified domain mappings.
  const origin = process.env.POC_CANONICAL_ORIGIN ?? 'http://127.0.0.1:3100';
  const canonical = new URL(`/vehicles/${id}`, origin);
  canonical.searchParams.set('tenant', tenant.slug);
  return { tenant, vehicle, image, title, description, canonical: canonical.href,
    modelUrl: base ? '/proof-model.glb' : undefined };
});
