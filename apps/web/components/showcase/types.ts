export type ShowcaseKind = "landing" | "intro" | "experience";
export type ShowcaseAssets = { modelUrl: string | null };
export type ShowcaseEntry = { part: 6; chapter: 0 };
export type ShowcaseProps = {
  tenant: string;
  assets: ShowcaseAssets;
  entry: ShowcaseEntry;
};
