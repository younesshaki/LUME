import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requestTenant } from "../tenant";
import { canonicalFor } from "../vehicles/presentation";
import { showcaseAssets } from "./media";
import { parseShowcaseEntry } from "./entry";
import type {
  ShowcaseKind,
} from "../../components/showcase/types";
export type ShowcaseSearch = Record<string, string | string[] | undefined>;
export async function showcaseRouteData(
  kind: ShowcaseKind,
  search: ShowcaseSearch,
) {
  const tenant = await requestTenant(search.tenant);
  let entry;
  try {
    entry = parseShowcaseEntry(search);
  } catch {
    notFound();
  }
  for (const key of [
    "draft",
    "revision",
    "revisionId",
    "previewToken",
    "preview",
  ])
    if (search[key] !== undefined) notFound();
  const title =
    kind === "landing"
      ? "Showcase"
      : kind === "intro"
        ? "LUME"
        : "A cinematic product showcase";
  return {
    kind,
    tenant,
    entry,
    title,
    assets: showcaseAssets(process.env.WEB_PREVIEW_R2_PUBLIC_BASE_URL),
  };
}
export async function showcaseMetadata(
  kind: ShowcaseKind,
  search: ShowcaseSearch,
): Promise<Metadata> {
  const data = await showcaseRouteData(kind, search);
  const title = `${data.title} | ${data.tenant.name}`;
  const description =
    "Built to make the product feel tangible before a visitor touches it. Explore the LUME cinematic product story.";
  const canonical = canonicalFor(data.tenant, "/showcase");
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    robots: { index: false, follow: false, nocache: true },
  };
}
