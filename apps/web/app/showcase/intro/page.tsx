import ShowcaseFrame from "../_components/ShowcaseFrame";
import {
  showcaseMetadata,
  type ShowcaseSearch,
} from "../../../server/showcase/route-data";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<ShowcaseSearch> };
export async function generateMetadata({ searchParams }: Props) {
  return showcaseMetadata("intro", await searchParams);
}
export default async function Page({ searchParams }: Props) {
  return <ShowcaseFrame kind="intro" search={await searchParams} />;
}
