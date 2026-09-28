import { describe, expect, it } from "vitest";
import {
  backgroundTone,
  bestTextContrast,
  blockSupportsBackgroundImage,
  hasBlockAppearance,
  validateBlockAppearance,
} from "./appearance";
import { validateBlock } from "./validation";

const hero = { id: "h", type: "hero", props: { title: "Hello" } };

describe("block appearance validation", () => {
  it("accepts theme tokens, per-mode custom colours and a library image", () => {
    expect(validateBlockAppearance({ backgroundColor: { token: "accent" } }).ok).toBe(true);
    expect(validateBlockAppearance({ backgroundColor: { custom: { light: "#F4F6FA", dark: "#101826" } }, fullWidth: true }).ok).toBe(true);
    expect(
      validateBlockAppearance({
        backgroundImage: { url: "https://example.supabase.co/storage/v1/object/public/tenant-media/t/a.webp", position: "top", size: "cover", overlayColor: "#000000", overlayOpacity: 45 },
      }).ok,
    ).toBe(true);
  });

  it("rejects anything that could inject CSS or load unsafe media", () => {
    for (const bad of [
      { backgroundColor: { custom: { light: "red; background:url(x)", dark: "#000000" } } },
      { backgroundColor: { token: "gold" } },
      { backgroundImage: { url: "javascript:alert(1)" } },
      { backgroundImage: { url: "http://insecure.example/a.png" } },
      { backgroundImage: { url: "https://ok.example/a.png", overlayOpacity: 95 } },
      { backgroundImage: { url: "https://ok.example/a.png", position: "left" } },
      { extra: true },
    ]) {
      expect(validateBlockAppearance(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("is part of block validation, and optional", () => {
    expect(validateBlock(hero).ok).toBe(true);
    expect(validateBlock({ ...hero, appearance: { backgroundColor: { token: "ink" } } }).ok).toBe(true);
    const result = validateBlock({ ...hero, appearance: { backgroundColor: { token: "neon" } } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/^appearance\.backgroundColor/);
  });

  it("treats an appearance with nothing set as none", () => {
    expect(hasBlockAppearance({})).toBe(false);
    expect(hasBlockAppearance({ fullWidth: true })).toBe(false);
    expect(hasBlockAppearance({ backgroundColor: { token: "panel" } })).toBe(true);
  });

  it("hides the image option on hero photo designs only", () => {
    expect(blockSupportsBackgroundImage(hero)).toBe(true);
    expect(blockSupportsBackgroundImage({ type: "hero", props: { variant: "search" } })).toBe(false);
    expect(blockSupportsBackgroundImage({ type: "cta-banner", props: {} })).toBe(true);
  });
});

describe("text contrast", () => {
  it("picks light text on dark backgrounds and dark text on light ones", () => {
    expect(backgroundTone("#101826")).toBe("dark");
    expect(backgroundTone("#F4F6FA")).toBe("light");
    expect(backgroundTone("#1F5EFF")).toBe("dark");
    expect(backgroundTone("rgba(255, 252, 246, 0.88)")).toBe("light");
    expect(backgroundTone("var(--x)")).toBeNull();
  });

  it("flags mid-tone colours where no text colour reaches AA", () => {
    expect(bestTextContrast("#000000")).toBeGreaterThan(15);
    expect(bestTextContrast("#777777")!).toBeLessThan(4.6);
  });
});
