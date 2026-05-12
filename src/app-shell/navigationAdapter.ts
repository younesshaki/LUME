import type { ActionKey } from "../lib/sound";
import type { AppRouteId } from "./routeIds";
import { resolvePath, screenToPath, type AppRouteLocation } from "./routePaths";

export type NavigateSource = "user" | "bot" | "system";

export type NavigateMeta = {
  sound?: ActionKey;
  source?: NavigateSource;
  replace?: boolean;
  analytics?: {
    action: string;
    fromRoute?: AppRouteId;
  };
};

export type NavigateOptions =
  | AppRouteLocation
  | { route: "titlecard"; partIndex?: number; chapterIndex?: number }
  | { route: "experience"; partIndex?: number; chapterIndex?: number };

export function resolveNavigatePath(target: NavigateOptions): string {
  // Components and the future bot should call navigation by intent
  // ({ route: "vehicles" }) instead of manually building URL strings.
  switch (target.route) {
    case "titlecard":
      return screenToPath("titlecard", {
        partIndex: target.partIndex,
        chapterIndex: target.chapterIndex,
      });
    case "experience":
      return resolvePath({
        route: "showcaseExperience",
        part: target.partIndex,
        chapter: target.chapterIndex,
      });
    default:
      return resolvePath(target);
  }
}
