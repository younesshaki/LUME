import { notFound } from "next/navigation";
import { contentMetadata } from "../../server/content/seo";
import { ContentPage } from "../../components/content/ContentPage";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Props = { params: Promise<{ slug: string }> };
function allowed(slug: string) {
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    ["api", "admin", "account", "showcase", "preview"].includes(slug)
  )
    notFound();
  return slug === "home" ? "home" : slug;
}
export async function generateMetadata({ params }: Props) {
  return contentMetadata(allowed((await params).slug));
}
export default async function Page({ params }: Props) {
  return <ContentPage slug={allowed((await params).slug)} />;
}
