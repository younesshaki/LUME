"use client";

import { useSliderWithInput } from "@/hooks/use-slider-with-input";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

/**
 * Price range control for the inventory filter bar.
 *
 * Lives inside the existing GET form rather than navigating itself, so the
 * page stays a server component and the filter still works without JS beyond
 * this control. It emits `minPrice`/`maxPrice` only when the range is actually
 * narrowed — at full span there is no filter, and submitting the bounds would
 * turn "no filter" into a filter that happens to match everything.
 */
export function VehiclePriceRange({
  ceiling,
  minPrice,
  maxPrice,
}: {
  /** Highest price in the tenant's inventory, rounded up. */
  ceiling: number;
  minPrice?: number;
  maxPrice?: number;
}) {
  const {
    sliderValue,
    inputValues,
    validateAndUpdateValue,
    handleInputChange,
    handleSliderChange,
  } = useSliderWithInput({
    minValue: 0,
    maxValue: ceiling,
    initialValue: [minPrice ?? 0, Math.min(maxPrice ?? ceiling, ceiling)],
    defaultValue: [0, ceiling],
  });

  const [low, high] = sliderValue;
  const step = ceiling > 100_000 ? 1000 : 500;

  return (
    <div className="grid w-full max-w-xs gap-1">
      <span className="text-xs text-muted-foreground">Price</span>

      {/* Only a narrowed range becomes a query param. */}
      {low > 0 ? <input type="hidden" name="minPrice" value={Math.round(low)} /> : null}
      {high < ceiling ? <input type="hidden" name="maxPrice" value={Math.round(high)} /> : null}

      <Slider
        value={sliderValue}
        min={0}
        max={ceiling}
        step={step}
        onValueChange={handleSliderChange}
        aria-label="Price range"
        className="py-3"
      />

      <div className="flex items-center gap-2">
        <Input
          type="text"
          inputMode="numeric"
          aria-label="Minimum price"
          value={inputValues[0]}
          onChange={(event) => handleInputChange(event, 0)}
          onBlur={() => validateAndUpdateValue(inputValues[0], 0)}
          className="h-9 w-24"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="text"
          inputMode="numeric"
          aria-label="Maximum price"
          value={inputValues[1]}
          onChange={(event) => handleInputChange(event, 1)}
          onBlur={() => validateAndUpdateValue(inputValues[1], 1)}
          className="h-9 w-24"
        />
      </div>
    </div>
  );
}
