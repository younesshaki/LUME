import type { ShowcaseEntry } from "../../components/showcase/types";
export function parseShowcaseEntry(
  search: Record<string, string | string[] | undefined>,
): ShowcaseEntry {
  if (
    (search.part !== undefined && search.part !== "6") ||
    (search.chapter !== undefined && search.chapter !== "0")
  )
    throw new Error("Unsupported showcase entry");
  return { part: 6, chapter: 0 };
}
