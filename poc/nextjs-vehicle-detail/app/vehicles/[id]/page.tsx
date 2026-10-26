import type { Metadata } from 'next';
import { getDetail } from '../../../lib/data';
import Enhancements from '../../../components/Enhancements';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tenant?: string | string[] }> };
async function detail(props: Props) {
  const { id } = await props.params;
  const { tenant } = await props.searchParams;
  return getDetail(id, typeof tenant === 'string' ? tenant : undefined);
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  const d = await detail(props);
  return { title: `${d.title} | ${d.tenant.name}`, description: d.description,
    alternates: { canonical: d.canonical }, robots: { index: false, follow: false },
    openGraph: { title: `${d.title} | ${d.tenant.name}`, description: d.description,
      url: d.canonical, images: [{ url: d.image, alt: d.title }] } };
}
export default async function Page(props: Props) {
  const d = await detail(props);
  return <main>
    <p>Disposable migration proof — not a replacement website</p>
    <header><p data-testid="tenant">{d.tenant.name} · {d.tenant.slug}</p><h1>{d.title}</h1></header>
    <img data-testid="vehicle-image" src={d.image} alt={d.title} width="960" height="640" fetchPriority="high" />
    <p>{d.description}</p>
    <dl><dt>Price (USD)</dt><dd>{Number(d.vehicle.price).toLocaleString('en-US')}</dd>
      <dt>Trim</dt><dd>{d.vehicle.trim || 'Not supplied'}</dd>
      <dt>Mileage</dt><dd>{d.vehicle.mileage ?? 'Not supplied'}</dd></dl>
    <Enhancements modelUrl={d.modelUrl} vehicleTitle={d.title} />
  </main>;
}
