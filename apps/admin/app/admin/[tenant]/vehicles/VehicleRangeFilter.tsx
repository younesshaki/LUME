"use client";

import { useSliderWithInput } from "@/hooks/use-slider-with-input";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

/**
 * One dual-handle range control in the inventory filter bar.
 *
 * Lives inside the existing GET form rather than navigating itself, so the
 * page stays a server component. It emits its two params only when the range
 * is actually narrowed — at full span there is no filter, and submitting the
 * bounds would turn "no filter" into a filter that happens to match
 * everything, complete with misleading chips.
 */
export function VehicleRangeFilter({
  label,
  minName,
  maxName,
  floor,
  ceiling,
  step = 1,
  minValue,
  maxValue,
}: {
  label: string;
  minName: string;
  maxName: string;
  /** Lowest value present in the tenant's inventory. */
  floor: number;
  /** Highest value present in the tenant's inventory. */
  ceiling: number;
  step?: number;
  minValue?: number;
  maxValue?: number;
}) {
  // One distinct value across the whole inventory gives floor === ceiling,
  // which is a degenerate track. Widen by one step so it stays usable.
  const safeCeiling = ceiling > floor ? ceiling : floor + step;

  const { sliderValue, inputValues, validateAndUpdateValue, handleInputChange, handleSliderChange } =
    useSliderWithInput({
      minValue: floor,
      maxValue: safeCeiling,
      initialValue: [
        Math.max(minValue ?? floor, floor),
        Math.min(maxValue ?? safeCeiling, safeCeiling),
      ],
      defaultValue: [floor, safeCeiling],
    });

  const [low, high] = sliderValue;

  return (
    <div className="grid w-full max-w-[15rem] gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>

      {low > floor ? <input type="hidden" name={minName} value={Math.round(low)} /> : null}
      {high < safeCeiling ? <input type="hidden" name={maxName} value={Math.round(high)} /> : null}

      <Slider
        value={sliderValue}
        min={floor}
        max={safeCeiling}
        step={step}
        onValueChange={handleSliderChange}
        aria-label={`${label} range`}
        className="py-3"
      />

      <div className="flex items-center gap-2">
        <Input
          type="text"
          inputMode="numeric"
          aria-label={`Minimum ${label.toLowerCase()}`}
          value={inputValues[0]}
          onChange={(event) => handleInputChange(event, 0)}
          onBlur={() => validateAndUpdateValue(inputValues[0], 0)}
          className="h-9 w-full"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="text"
          inputMode="numeric"
          aria-label={`Maximum ${label.toLowerCase()}`}
          value={inputValues[1]}
          onChange={(event) => handleInputChange(event, 1)}
          onBlur={() => validateAndUpdateValue(inputValues[1], 1)}
          className="h-9 w-full"
        />
      </div>
    </div>
  );
}
