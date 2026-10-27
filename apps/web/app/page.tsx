import { contentMetadata } from "../server/content/seo";
import { ContentPage } from "../components/content/ContentPage";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const generateMetadata = () => contentMetadata("home");
export default function Home() {
  return <ContentPage slug="home" />;
}
