import { describe, expect, it } from "vitest";
import { resolveBlockAppearance, type BlockAppearanceContext } from "./blockAppearance";

const palettes: BlockAppearanceContext["palettes"] = {
  light: {
    colors: { background: "#F7F8FA", panel: "#FFFFFF", gold: "#1F5EFF", ink: "#111827" },
    variables: { "--theme-lume-ink": "#111827", "--theme-lume-panel": "#FFFFFF", "--theme-site-background-image": "url(x)" },
  },
  dark: {
    colors: { background: "#0B0F17", panel: "#121826", gold: "#5B8CFF", ink: "#F3F4F6" },
    variables: { "--theme-lume-ink": "#F3F4F6", "--theme-lume-panel": "#121826" },
  },
};
const light: BlockAppearanceContext = { mode: "light", palettes };
const dark: BlockAppearanceContext = { mode: "dark", palettes };

describe("resolveBlockAppearance", () => {
  it("draws nothing without a background", () => {
    expect(resolveBlockAppearance(undefined, light)).toBeNull();
    expect(resolveBlockAppearance({ fullWidth: true }, light)).toBeNull();
  });

  it("keeps the page's text on the page and panel colours", () => {
    const resolved = resolveBlockAppearance({ backgroundColor: { token: "panel" } }, light)!;
    expect(resolved.style["--block-bg"]).toBe("#FFFFFF");
    expect(resolved.tone).toBeNull();
  });

  it("runs an ink band in light mode with the dark palette, so text and cards stay readable", () => {
    const resolved = resolveBlockAppearance({ backgroundColor: { token: "ink" } }, light)!;
    expect(resolved.style["--block-bg"]).toBe("#111827");
    expect(resolved.tone).toBe("dark");
    expect(resolved.style["--theme-lume-ink"]).toBe("#F3F4F6");
    expect(resolved.style["--theme-lume-panel"]).toBe("#121826");
  });

  it("follows the mode for the same token", () => {
    expect(resolveBlockAppearance({ backgroundColor: { token: "ink" } }, dark)!).toMatchObject({
      tone: "light",
      style: { "--block-bg": "#F3F4F6", "--theme-lume-ink": "#111827" },
    });
  });

  it("uses each mode's own custom colour", () => {
    const appearance = { backgroundColor: { custom: { light: "#EEF2FF", dark: "#1E1B4B" } } } as const;
    expect(resolveBlockAppearance(appearance, light)!).toMatchObject({ tone: null, style: { "--block-bg": "#EEF2FF" } });
    expect(resolveBlockAppearance(appearance, dark)!).toMatchObject({ tone: null, style: { "--block-bg": "#1E1B4B" } });
    // A dark custom colour in light mode switches the text to light.
    expect(resolveBlockAppearance({ backgroundColor: { custom: { light: "#1E1B4B", dark: "#1E1B4B" } } }, light)!.tone).toBe("dark");
  });

  it("lets the image overlay decide the text tone", () => {
    const resolved = resolveBlockAppearance(
      { backgroundImage: { url: "https://cdn.example/a.webp", position: "top", overlayColor: "#000000", overlayOpacity: 50 } },
      light,
    )!;
    expect(resolved.image).toEqual({ url: "https://cdn.example/a.webp", fit: "cover", position: "center top" });
    expect(resolved.style["--block-bg-overlay"]).toBe("color-mix(in srgb, #000000 50%, transparent)");
    expect(resolved.tone).toBe("dark");
  });

  it("never copies the site background image into a block", () => {
    const resolved = resolveBlockAppearance({ backgroundColor: { token: "ink" } }, dark)!;
    expect(Object.keys(resolved.style).some((name) => name.startsWith("--theme-site-background"))).toBe(false);
  });

  it("does not switch palettes before the tenant design has loaded", () => {
    const resolved = resolveBlockAppearance({ backgroundColor: { token: "ink" } }, { mode: "light", palettes: null })!;
    expect(resolved.style["--block-bg"]).toBe("var(--theme-lume-ink)");
    expect(resolved.tone).toBeNull();
  });
});
