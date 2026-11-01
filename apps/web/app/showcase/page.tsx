import type { Metadata } from "next";
import Link from "next/link";
import { requestTenant } from "../../server/tenant";
import { canonicalFor } from "../../server/vehicles/presentation";
import { showcaseModelUrl } from "../../server/showcase/media";
import SceneIsland from "../../components/showcase-poc/SceneIsland";
import "./showcase.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Props = { searchParams: Promise<{ tenant?: string | string[] }> };
export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const tenant = await requestTenant((await searchParams).tenant);
  const title = `Showcase study | ${tenant.name}`;
  const description =
    "A single cinematic scene exploring the LUME product in three dimensions.";
  const canonical = canonicalFor(tenant, "/showcase");
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    robots: { index: false, follow: false },
  };
}
export default async function Showcase({ searchParams }: Props) {
  const tenant = await requestTenant((await searchParams).tenant);
  const modelUrl = showcaseModelUrl(process.env.WEB_PREVIEW_R2_PUBLIC_BASE_URL);
  const selector = `?tenant=${encodeURIComponent(tenant.slug)}`;
  return (
    <main className="showcase-poc">
      <header className="showcase-poc__intro">
        <p>Disposable study · one scene · staging preview · noindex</p>
        <h1>A cinematic product showcase</h1>
        <p>
          Built to make the product feel tangible before a visitor touches it.
        </p>
        <nav aria-label="Leave the showcase">
          <Link href={`/${selector}`} prefetch={false}>
            Home
          </Link>
          <Link href={`/vehicles${selector}`} prefetch={false}>
            Vehicles
          </Link>
        </nav>
      </header>
      {modelUrl ? (
        <SceneIsland modelUrl={modelUrl} />
      ) : (
        <p>
          Public preview media is not configured. The rest of the site remains
          available.
        </p>
      )}
      <noscript>
        <p>
          The interactive scene needs JavaScript. Product information and the
          navigation above remain available.
        </p>
      </noscript>
      <footer>
        <p>The brand story can now take its place.</p>
        <p>End of the single-scene study.</p>
      </footer>
    </main>
  );
}
