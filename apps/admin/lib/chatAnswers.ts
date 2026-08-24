import type { BotAction, Vehicle } from "@lume/types";
import type { extractVehicleFilters } from "@lume/rag";

/**
 * Deterministic answer text for the public concierge.
 *
 * Every function here is pure: user text and already-fetched vehicles in,
 * a string (or a filter action) out. No queries, no conversation state, no
 * Request. They lived at the bottom of app/api/chat/route.ts, which meant the
 * only way to exercise the exact wording a visitor sees was to stand up a
 * tenant and a Supabase client.
 *
 * The wording is load-bearing and was tuned against live sessions — several
 * of these strings exist to stop the model inventing market, condition or
 * availability claims it cannot verify. Change them deliberately.
 */

type VehicleFilters = ReturnType<typeof extractVehicleFilters>;

/** Answer direct availability questions from the verified inventory match set. */
export function availabilityAnswerFromGroundedInventory(
  userText: string,
  filters: VehicleFilters,
  vehicles: readonly Vehicle[],
  totalMatched: number,
): string | null {
  const isAvailabilityQuestion =
    /\b(?:do you have|you have|have any|are there|is there|any)\b/i.test(
      userText,
    );
  if (!isAvailabilityQuestion || (!filters.make && !filters.model)) return null;

  const requested =
    [filters.year, filters.make, filters.model]
      .filter((value): value is string | number => value !== undefined)
      .join(" ") || "matching vehicles";

  if (totalMatched === 0)
    return `No — there are no ${requested} vehicles in inventory right now.`;

  const count = `${totalMatched} matching ${requested} vehicle${totalMatched === 1 ? "" : "s"}`;
  const examples = vehicles.slice(0, 3).map((vehicle) => {
    const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
      .filter(Boolean)
      .join(" ");
    return `${label} — Est. $${vehicle.price.toLocaleString()}.`;
  });
  return `Yes — ${count} ${totalMatched === 1 ? "is" : "are"} available.${examples.length ? ` ${examples.join(" ")}` : ""}`;
}

export function isDirectInventoryPresentationRequest(
  userText: string,
  filters: VehicleFilters,
): boolean {
  if (Object.keys(filters).length === 0) return false;
  // Make/model availability has its own deterministic phrasing above. Broad
  // constrained availability ("do you have cars under 20k?") still belongs
  // on this deterministic result/action path; otherwise UI synchronization
  // is again left to optional model tool behavior.
  if (
    /\b(?:do you have|you have|have any|are there|is there)\b/i.test(
      userText,
    ) &&
    (filters.make || filters.model)
  )
    return false;
  return /\b(?:show|find|browse|list|inventory|under|over|between|budget|looking|need|want|cars?|vehicles?|cheapest|least\s+expensive|most\s+expensive|lowest|highest)\b/i.test(
    userText,
  );
}

export function inventoryResultAnswer(
  vehicles: readonly Vehicle[],
  totalMatched: number,
): string {
  const examples = vehicles.slice(0, 3).map((vehicle, index) => {
    const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
      .filter(Boolean)
      .join(" ");
    return `${index + 1}. ${label} — Est. $${vehicle.price.toLocaleString()}`;
  });
  return `${totalMatched.toLocaleString()} matching vehicle${totalMatched === 1 ? "" : "s"} found.${examples.length ? ` ${examples.join(" · ")}.` : ""}`;
}

/** Recommendation language must not make the model invent market or condition claims. */
export function isInventoryRecommendationRequest(userText: string): boolean {
  return /\b(?:recommend(?:ation)?|suggest(?:ion)?|help\s+me\s+choose|which\s+(?:one|vehicle|car)\s+(?:should|would)|best\s+(?:one|vehicle|car|bmw|toyota|suv|sedan))\b/i.test(
    userText,
  );
}

export function inventoryRecommendationAnswer(
  vehicles: readonly Vehicle[],
  totalMatched: number,
): string {
  const examples = vehicles.slice(0, 3).map((vehicle, index) => {
    const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
      .filter(Boolean)
      .join(" ");
    const details = [
      `Est. $${vehicle.price.toLocaleString()}`,
      vehicle.mileage === null
        ? null
        : `${vehicle.mileage.toLocaleString()} mi`,
      vehicle.bodyStyle || null,
      vehicle.drivetrain || null,
    ].filter((value): value is string => Boolean(value));
    return `${index + 1}. ${label} — ${details.join(" · ")}`;
  });
  return `${totalMatched} verified matching vehicle${totalMatched === 1 ? "" : "s"} are available. ${examples.join(" · ")}. Tell me your budget, preferred body style, or mileage target and I’ll narrow the list.`;
}

/** A non-navigational ordinal follow-up is answered from the stored result, never a fresh query. */
export function ordinalVehicleReferenceAnswer(
  userText: string,
  vehicle: Vehicle,
): string {
  const ordinal =
    /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|\d{1,2}(?:st|nd|rd|th))\s+(?:one|vehicle|car|listing)\b/i
      .exec(userText)?.[1]
      ?.toLowerCase() ?? "selected";
  const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");
  const details = [
    vehicle.mileage !== null ? `${vehicle.mileage.toLocaleString()} mi` : null,
    vehicle.drivetrain || null,
    vehicle.sellerCity && vehicle.sellerState
      ? `${vehicle.sellerCity}, ${vehicle.sellerState}`
      : null,
  ].filter((value): value is string => Boolean(value));
  return `The ${ordinal} result is ${label} — Est. $${vehicle.price.toLocaleString()}${details.length ? ` · ${details.join(" · ")}` : ""}.`;
}

const ORDINAL_POSITION_WORDS = [
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
  "Tenth",
] as const;

function ordinalPositionLabel(index: number): string {
  return ORDINAL_POSITION_WORDS[index] ?? `#${index + 1}`;
}

/** Deterministic comparison of result-set positions — real fields only. */
export function compareVehiclesAnswer(indexes: number[], vehicles: Vehicle[]): string {
  const lines = vehicles.map((vehicle, position) => {
    const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
      .filter(Boolean)
      .join(" ");
    const mileage =
      vehicle.mileage === null
        ? "mileage not listed"
        : `${vehicle.mileage.toLocaleString()} mi`;
    return `${ordinalPositionLabel(indexes[position]!)}: ${label} — Est. $${vehicle.price.toLocaleString()} · ${mileage} · ${vehicle.drivetrain || "drivetrain not listed"}`;
  });
  const byPrice = [...vehicles].sort((a, b) => a.price - b.price);
  const cheapest = byPrice[0]!;
  const priciest = byPrice[byPrice.length - 1]!;
  const cheapestLabel = [
    cheapest.year,
    cheapest.make,
    cheapest.model,
    cheapest.trim,
  ]
    .filter(Boolean)
    .join(" ");
  const verdict =
    priciest.price > cheapest.price
      ? `\nThe ${cheapestLabel} is the lower-priced by $${(priciest.price - cheapest.price).toLocaleString()}.`
      : "";
  return `Here’s the comparison:\n${lines.map((line) => `• ${line}`).join("\n")}${verdict}`;
}

export function selectedVehicleDetailAnswer(
  userText: string,
  vehicle: Vehicle,
): string {
  const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");
  const requestedDrivetrain = /\b(?:awd|fwd|rwd)\b/i
    .exec(userText)?.[0]
    ?.toUpperCase();
  if (requestedDrivetrain) {
    const listed = vehicle.drivetrain || "not listed";
    return listed.toUpperCase() === requestedDrivetrain
      ? `Yes — ${label} is listed as ${listed}.`
      : `No — ${label} is listed as ${listed}.`;
  }
  if (/\bhow\s+many\s+(?:miles|mileage)\b/i.test(userText)) {
    return vehicle.mileage === null
      ? `${label} does not have mileage listed in the current inventory data.`
      : `${label} is listed with ${vehicle.mileage.toLocaleString()} miles.`;
  }
  const details = [
    `Est. $${vehicle.price.toLocaleString()}`,
    vehicle.mileage === null ? null : `${vehicle.mileage.toLocaleString()} mi`,
    vehicle.drivetrain || null,
    vehicle.fuelType || null,
    vehicle.sellerCity && vehicle.sellerState
      ? `${vehicle.sellerCity}, ${vehicle.sellerState}`
      : null,
  ].filter((value): value is string => Boolean(value));
  return `${label} — ${details.join(" · ")}.`;
}

export function unsupportedVehicleFactAnswer(
  userText: string,
  vehicle: Vehicle | null,
): string {
  const rawTopic =
    /\b(?:reliab(?:le|ility)|accident|carfax|history|condition|maintenance|service\s+records?|heated\s+seats?|ventilated\s+seats?|options?|features?)\b/i
      .exec(userText)?.[0]
      ?.toLowerCase();
  const topic = rawTopic?.startsWith("reliab")
    ? "reliability"
    : (rawTopic ?? "that detail");
  const label = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
        .filter(Boolean)
        .join(" ")
    : null;
  return `I don’t have verified ${topic} information${label ? ` for ${label}` : " in the current inventory data"}, so I won’t guess. I can help with the listed price, mileage, drivetrain, fuel type, and location—or you can contact the seller to confirm it.`;
}

export function inventoryFilterAction(
  filters: VehicleFilters,
): BotAction {
  return {
    type: "filter_inventory",
    ...(filters.make ? { make: filters.make } : {}),
    ...(filters.model ? { model: filters.model } : {}),
    ...(filters.bodyStyle ? { bodyStyle: filters.bodyStyle } : {}),
    ...(filters.stockType ? { stockType: filters.stockType } : {}),
    ...(filters.fuelType ? { fuelType: filters.fuelType } : {}),
    ...(filters.drivetrain ? { drivetrain: filters.drivetrain } : {}),
    ...(filters.sellerState ? { sellerState: filters.sellerState } : {}),
    ...(filters.sellerCity ? { sellerCity: filters.sellerCity } : {}),
    ...(filters.year !== undefined
      ? { yearMin: filters.year, yearMax: filters.year }
      : {}),
    ...(filters.year === undefined && filters.yearMin !== undefined
      ? { yearMin: filters.yearMin }
      : {}),
    ...(filters.year === undefined && filters.yearMax !== undefined
      ? { yearMax: filters.yearMax }
      : {}),
    ...(filters.mileageMax !== undefined
      ? { mileageMax: filters.mileageMax }
      : {}),
    ...(filters.priceMin !== undefined ? { priceMin: filters.priceMin } : {}),
    ...(filters.priceMax !== undefined ? { priceMax: filters.priceMax } : {}),
    ...(filters.sort ? { sort: filters.sort } : {}),
  };
}

/** Keep a refinement honest without silently widening to all inventory. */
export function zeroResultAnswer(
  filters: VehicleFilters,
): string {
  // Every active facet must appear, so a refinement that eliminated the last
  // match is named. Omitting e.g. drivetrain made "no BMW SUV under $70k" read
  // as if none exist, when one does and is only excluded by the AWD filter.
  const yearLabel =
    filters.year !== undefined
      ? String(filters.year)
      : filters.yearMin !== undefined && filters.yearMax !== undefined
        ? `${filters.yearMin}–${filters.yearMax}`
        : filters.yearMin !== undefined
          ? `${filters.yearMin} or newer`
          : filters.yearMax !== undefined
            ? `${filters.yearMax} or older`
            : undefined;
  const mileageLabel =
    filters.mileageMax !== undefined
      ? `under ${filters.mileageMax.toLocaleString()} miles`
      : undefined;
  const location = [filters.sellerCity, filters.sellerState]
    .filter(Boolean)
    .join(", ");
  const locationLabel = location ? `in ${location}` : undefined;
  const constraints = [
    yearLabel,
    filters.stockType,
    filters.drivetrain,
    filters.fuelType,
    filters.make,
    filters.model,
    filters.bodyStyle,
    mileageLabel,
    priceConstraintLabel(filters),
    locationLabel,
  ].filter((value): value is string => Boolean(value));
  const description =
    constraints.length > 0 ? constraints.join(" ") : "that refinement";
  return `Nothing matches ${description} right now. I’ve kept your previous results in place rather than widening the search—would you like to relax a constraint?`;
}

function priceConstraintLabel(
  filters: VehicleFilters,
): string | undefined {
  if (filters.priceMin !== undefined && filters.priceMax !== undefined) {
    return `between $${filters.priceMin.toLocaleString()} and $${filters.priceMax.toLocaleString()}`;
  }
  if (filters.priceMax !== undefined)
    return `under $${filters.priceMax.toLocaleString()}`;
  if (filters.priceMin !== undefined)
    return `over $${filters.priceMin.toLocaleString()}`;
  return undefined;
}
