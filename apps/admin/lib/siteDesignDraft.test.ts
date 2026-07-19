import { describe, expect, it } from "vitest";
import { createDefaultSiteDesign, getSiteTemplate } from "@lume/types";
import {
  clearDesignDraft,
  copyMode,
  hasDesignChanges,
  readDesignDraft,
  resetMode,
  saveDesignDraft,
  updateModeBackground,
  updateModeColor,
  type DesignDraftStorage,
} from "./siteDesignDraft";

function memoryStorage(): DesignDraftStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

describe("website design drafts", () => {
  const luxury = getSiteTemplate("luxury");
  const published = createDefaultSiteDesign(luxury);

  it("edits dark and light modes independently", () => {
    const dark = updateModeColor(published, "dark", "background", "#111111");
    const light = updateModeColor(dark, "light", "background", "#eeeeee");
    expect(light.modes.dark.colors?.background).toBe("#111111");
    expect(light.modes.light.colors?.background).toBe("#eeeeee");
    expect(published.modes.dark.colors).toBeUndefined();
  });

  it("persists a background in only the selected mode", () => {
    const next = updateModeBackground(published, "light", {
      url: "https://cdn.example/tenant/site-design/light/siteBackground.webp",
      position: "top",
    });
    expect(next.modes.light.assets?.siteBackground?.position).toBe("top");
    expect(next.modes.dark.assets).toBeUndefined();
  });

  it("copies and resets a single mode without mutating its source", () => {
    const edited = updateModeColor(published, "dark", "gold", "#abc123");
    const copied = copyMode(edited, "dark", "light");
    expect(copied.modes.light.colors?.gold).toBe("#abc123");
    const reset = resetMode(copied, "light");
    expect(reset.modes.dark.colors?.gold).toBe("#abc123");
    expect(reset.modes.light.colors?.gold).toBe(luxury.modes.light.colors?.gold);
  });

  it("keeps one independent local fallback for each template", () => {
    const storage = memoryStorage();
    const draft = updateModeColor(published, "dark", "ink", "#fafafa");
    saveDesignDraft(storage, "Atelier", draft);
    expect(readDesignDraft(storage, "atelier", "luxury")?.modes.dark.colors?.ink).toBe("#fafafa");

    const capital = createDefaultSiteDesign(getSiteTemplate("capital"));
    const capitalDraft = updateModeColor(capital, "light", "ink", "#123456");
    saveDesignDraft(storage, "Atelier", capitalDraft);
    expect(readDesignDraft(storage, "atelier", "capital")?.modes.light.colors?.ink).toBe("#123456");
    expect(readDesignDraft(storage, "atelier", "luxury")?.modes.dark.colors?.ink).toBe("#fafafa");
  });

  it("detects changes and clears stored drafts", () => {
    const storage = memoryStorage();
    const draft = updateModeColor(published, "light", "panel", "#ffffff");
    expect(hasDesignChanges(draft, published)).toBe(true);
    saveDesignDraft(storage, "atelier", draft);
    clearDesignDraft(storage, "atelier", "luxury");
    expect(readDesignDraft(storage, "atelier", "luxury")).toBeNull();
  });
});
