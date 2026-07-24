import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FILTERS,
  type VehicleFacets,
} from "@/experience/vehicles/catalog";
import { AdvancedFilters, MarketplaceToolbar } from "./VehicleFilters";

const facets: VehicleFacets = {
  makes: ["BMW"],
  models: ["X5"],
  states: [],
  cities: [],
};

describe("shared vehicle filters", () => {
  it("keeps the advanced price controls available wherever the marketplace toolbar is used", () => {
    const onOpenFilters = vi.fn();
    const onChange = vi.fn();

    render(
      <>
        <MarketplaceToolbar
          filters={DEFAULT_FILTERS}
          sort="recommended"
          activeCount={0}
          savedCount={0}
          makes={facets.makes}
          models={facets.models}
          onFiltersChange={onChange}
          onSortChange={vi.fn()}
          onOpenFilters={onOpenFilters}
        />
        <AdvancedFilters
          open
          facets={facets}
          filters={DEFAULT_FILTERS}
          activeCount={0}
          onChange={onChange}
          onClear={vi.fn()}
          onClose={vi.fn()}
        />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^filters$/i }));
    expect(onOpenFilters).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    expect(screen.getByLabelText("Minimum price")).toBeInTheDocument();
    expect(screen.getByLabelText("Maximum price")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Maximum price"), {
      target: { value: "75000" },
    });
    expect(onChange).toHaveBeenCalledWith({ priceMax: 75000 });
  });
});
