import "server-only";
import Link from "next/link";
import ShowcaseIsland from "../../../components/showcase/ShowcaseIsland";
import {
  showcaseRouteData,
  type ShowcaseSearch,
} from "../../../server/showcase/route-data";
import type { ShowcaseKind } from "../../../components/showcase/types";
import "../showcase.css";
export default async function ShowcaseFrame({
  kind,
  search,
}: {
  kind: ShowcaseKind;
  search: ShowcaseSearch;
}) {
  const data = await showcaseRouteData(kind, search);
  const query = `?tenant=${encodeURIComponent(data.tenant.slug)}`;
  return (
    <main className={`showcase showcase--${kind}`}>
      <header className="showcase__header">
        <p className="showcase__preview">Staging preview · noindex</p>
        <h1>{data.title}</h1>
        <p>
          Built to make the product feel tangible before a visitor touches it.
        </p>
        <nav aria-label="Showcase navigation">
          <Link href={`/${query}`} prefetch={false}>
            Home
          </Link>
          <Link href={`/vehicles${query}`} prefetch={false}>
            Vehicles
          </Link>
          {kind !== "landing" && (
            <Link href={`/showcase${query}`} prefetch={false}>
              Showcase
            </Link>
          )}
        </nav>
      </header>
      <ShowcaseIsland
        kind={kind}
        tenant={data.tenant.slug}
        entry={data.entry}
        assets={data.assets}
      />
      <noscript>
        <section className="showcase__nojs">
          <p>
            The interactive showcase needs JavaScript. The product story and
            navigation remain available.
          </p>
          <a href={`/products${query}`}>Explore products</a>
          {kind === "experience" &&
            data.assets.scenes.map((scene) => (
              <section key={scene.id}>
                <h2>{scene.title}</h2>
                {scene.lines.map((line) => (
                  <p key={line.text}>{line.text}</p>
                ))}
              </section>
            ))}
        </section>
        <style>{`.showcase__reserved{display:none}`}</style>
      </noscript>
    </main>
  );
}
