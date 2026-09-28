"use client";

import {
  BLOCK_IMAGE_OVERLAY,
  MIN_TEXT_CONTRAST,
  bestTextContrast,
  blockSupportsBackgroundImage,
} from "@lume/blocks";
import type { BlockAppearance, BlockBackgroundToken, PageBlock } from "@lume/types";
import { AssetPicker } from "@/components/asset-picker";

type ColorChoice = "none" | BlockBackgroundToken | "custom";

const COLOR_CHOICES: Array<{ value: ColorChoice; label: string }> = [
  { value: "none", label: "None (template)" },
  { value: "page", label: "Page colour" },
  { value: "panel", label: "Panel colour" },
  { value: "accent", label: "Accent colour" },
  { value: "ink", label: "Text colour (inverted band)" },
  { value: "custom", label: "Custom colour" },
];

const DEFAULT_CUSTOM = { light: "#F1F4F9", dark: "#141B2B" };

const inputClass =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";
const labelClass = "text-xs font-medium text-muted-foreground";

/**
 * Background colour and image for the selected block — the same options for
 * every block type, stored as PageBlock.appearance. Theme colours follow the
 * site's light/dark mode; a custom colour takes one value per mode.
 */
export function BlockBackgroundPanel({
  tenantId,
  block,
  errors,
  onChange,
}: {
  tenantId: string;
  block: PageBlock;
  errors: string[];
  onChange: (appearance: BlockAppearance | undefined) => void;
}) {
  const appearance = block.appearance ?? {};
  const color = appearance.backgroundColor;
  const choice: ColorChoice = !color ? "none" : "token" in color ? color.token : "custom";
  const image = appearance.backgroundImage;
  const allowImage = blockSupportsBackgroundImage(block);

  // Drop empty keys so "no background" stores nothing at all.
  function update(next: BlockAppearance) {
    const cleaned: BlockAppearance = {};
    if (next.backgroundColor) cleaned.backgroundColor = next.backgroundColor;
    if (next.backgroundImage) cleaned.backgroundImage = next.backgroundImage;
    if (next.fullWidth && (cleaned.backgroundColor || cleaned.backgroundImage)) cleaned.fullWidth = true;
    onChange(Object.keys(cleaned).length ? cleaned : undefined);
  }

  function setChoice(value: ColorChoice) {
    const backgroundColor =
      value === "none"
        ? undefined
        : value === "custom"
          ? { custom: color && "custom" in color ? color.custom : DEFAULT_CUSTOM }
          : { token: value };
    update({ ...appearance, backgroundColor });
  }

  function setCustom(mode: "light" | "dark", value: string) {
    const current = color && "custom" in color ? color.custom : DEFAULT_CUSTOM;
    update({ ...appearance, backgroundColor: { custom: { ...current, [mode]: value } } });
  }

  function setImage(patch: Partial<NonNullable<BlockAppearance["backgroundImage"]>> | null) {
    if (patch === null) return update({ ...appearance, backgroundImage: undefined });
    const base = image ?? { url: "", overlayColor: "#000000", overlayOpacity: BLOCK_IMAGE_OVERLAY.default };
    update({ ...appearance, backgroundImage: { ...base, ...patch } });
  }

  const customContrast =
    color && "custom" in color
      ? (["light", "dark"] as const).filter((mode) => (bestTextContrast(color.custom[mode]) ?? 21) < MIN_TEXT_CONTRAST)
      : [];
  const thinOverlay = image && (image.overlayOpacity ?? BLOCK_IMAGE_OVERLAY.default) < BLOCK_IMAGE_OVERLAY.recommendedMin;

  return (
    <section aria-labelledby="block-background-heading" className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
      <h3 id="block-background-heading" className="text-sm font-semibold">Background</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Behind this block only. Theme colours adapt to light and dark mode; text switches automatically to stay readable.
      </p>

      <div className="mt-3 space-y-4">
        <div>
          <label htmlFor="block-bg-color" className={labelClass}>Colour</label>
          <select id="block-bg-color" value={choice} onChange={(event) => setChoice(event.target.value as ColorChoice)} className={inputClass}>
            {COLOR_CHOICES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {color && "custom" in color ? (
          <div className="grid grid-cols-2 gap-3">
            {(["light", "dark"] as const).map((mode) => (
              <div key={mode}>
                <label htmlFor={`block-bg-${mode}`} className={labelClass}>{mode === "light" ? "Light mode" : "Dark mode"}</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id={`block-bg-${mode}`}
                    type="color"
                    value={color.custom[mode]}
                    onChange={(event) => setCustom(mode, event.target.value.toUpperCase())}
                    className="size-9 shrink-0 cursor-pointer rounded-md border border-neutral-300 bg-transparent p-1 dark:border-neutral-700"
                  />
                  <input
                    aria-label={`${mode === "light" ? "Light" : "Dark"} mode hex value`}
                    value={color.custom[mode]}
                    onChange={(event) => setCustom(mode, event.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {customContrast.length ? (
          <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
            Text may be hard to read on the {customContrast.join(" and ")} mode colour (below {MIN_TEXT_CONTRAST}:1 contrast). Pick a lighter or darker shade.
          </p>
        ) : null}

        {allowImage ? (
          <div>
            <span className={labelClass}>Image</span>
            <div className="mt-1">
              <AssetPicker tenantId={tenantId} value={image?.url ?? ""} onSelect={(asset) => setImage({ url: asset.url })} />
            </div>
            {image?.url ? (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-3">
                  <img src={image.url} alt="" className="h-12 w-20 rounded-md border object-cover" />
                  <button type="button" onClick={() => setImage(null)} className="text-xs font-medium text-destructive hover:underline">
                    Remove image
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="block-bg-position" className={labelClass}>Position</label>
                    <select id="block-bg-position" value={image.position ?? "center"} onChange={(event) => setImage({ position: event.target.value as "center" | "top" | "bottom" })} className={inputClass}>
                      <option value="center">Centre</option>
                      <option value="top">Top</option>
                      <option value="bottom">Bottom</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="block-bg-size" className={labelClass}>Fit</label>
                    <select id="block-bg-size" value={image.size ?? "cover"} onChange={(event) => setImage({ size: event.target.value as "cover" | "contain" })} className={inputClass}>
                      <option value="cover">Fill the block</option>
                      <option value="contain">Show whole image</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-[auto_1fr] items-end gap-3">
                  <div>
                    <label htmlFor="block-bg-overlay-color" className={labelClass}>Overlay</label>
                    <input
                      id="block-bg-overlay-color"
                      type="color"
                      value={image.overlayColor ?? "#000000"}
                      onChange={(event) => setImage({ overlayColor: event.target.value.toUpperCase() })}
                      className="mt-1 block size-9 cursor-pointer rounded-md border border-neutral-300 bg-transparent p-1 dark:border-neutral-700"
                    />
                  </div>
                  <div>
                    <label htmlFor="block-bg-overlay" className={labelClass}>
                      Overlay strength: {image.overlayOpacity ?? BLOCK_IMAGE_OVERLAY.default}%
                    </label>
                    <input
                      id="block-bg-overlay"
                      type="range"
                      min={BLOCK_IMAGE_OVERLAY.min}
                      max={BLOCK_IMAGE_OVERLAY.max}
                      step={5}
                      value={image.overlayOpacity ?? BLOCK_IMAGE_OVERLAY.default}
                      onChange={(event) => setImage({ overlayOpacity: Number(event.target.value) })}
                      className="mt-2 w-full"
                    />
                  </div>
                </div>
                {thinOverlay ? (
                  <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
                    With less than {BLOCK_IMAGE_OVERLAY.recommendedMin}% overlay, text over the photo may be hard to read.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">This hero design already fills its section with a photo, so it has no background image.</p>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={appearance.fullWidth === true}
            disabled={!color && !image}
            onChange={(event) => update({ ...appearance, fullWidth: event.target.checked })}
          />
          Stretch across the full window width
        </label>

        {errors.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-destructive">
            {errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
