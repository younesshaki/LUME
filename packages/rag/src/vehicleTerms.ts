/**
 * Vehicle term dictionaries: consolidates all make, body style, fuel, and drivetrain aliases.
 * Single source of truth for vehicle term normalization.
 */

export const MAKE_ALIASES: Record<string, string[]> = {
  acura: ["acura"],
  audi: ["audi"],
  bmw: ["bmw", "beemer", "bimmer"],
  buick: ["buick"],
  cadillac: ["cadillac", "caddy"],
  chevrolet: ["chevrolet", "chevy", "chev"],
  chrysler: ["chrysler"],
  dodge: ["dodge"],
  ferrari: ["ferrari", "ferraris", "ferari", "feraris"],
  ford: ["ford", "frd"],
  gmc: ["gmc"],
  genesis: ["genesis"],
  honda: ["honda", "hon", "hondas"],
  hummer: ["hummer"],
  hyundai: ["hyundai"],
  infiniti: ["infiniti"],
  jaguar: ["jaguar", "jag"],
  jeep: ["jeep"],
  kia: ["kia"],
  lamborghini: ["lamborghini", "lambo", "lambos", "lamborghinis"],
  "land rover": ["land rover", "landrover"],
  lexus: ["lexus"],
  lincoln: ["lincoln"],
  mini: ["mini"],
  maserati: ["maserati"],
  mazda: ["mazda"],
  "mercedes-benz": ["mercedes-benz", "mercedes benz", "mercedes", "merc"],
  mitsubishi: ["mitsubishi"],
  nissan: ["nissan"],
  polestar: ["polestar"],
  porsche: ["porsche", "porshe", "porcshe"],
  ram: ["ram"],
  "rolls-royce": ["rolls-royce", "rolls royce", "rr"],
  subaru: ["subaru"],
  tesla: ["tesla", "teslas"],
  toyota: ["toyota", "toy", "toyotas", "toyta", "teyota", "teyotas"],
  volkswagen: ["volkswagen", "vw"],
  volvo: ["volvo"],
};

export const BODY_STYLE_ALIASES: Record<string, string[]> = {
  sedan: ["sedan", "saloon", "four-door", "4-door"],
  suv: ["suv", "s.u.v.", "sport utility vehicle", "sport utility", "utility vehicle", "4x4"],
  hatchback: ["hatchback", "hatch", "3-door", "5-door"],
  coupe: ["coupe", "coupé", "2-door"],
  convertible: ["convertible", "cabriolet", "cabrio", "roadster", "spider"],
  truck: ["truck", "pickup", "pick-up", "ute"],
  wagon: ["wagon", "estate", "station wagon"],
  minivan: ["minivan", "mini van", "people carrier", "van"],
  crossover: ["crossover", "cuv"],
};

export const FUEL_TYPE_ALIASES: Record<string, string[]> = {
  gasoline: ["gasoline", "gas", "petrol"],
  diesel: ["diesel"],
  electric: ["electric", "ev", "battery", "bev", "battery electric", "electrik"],
  hybrid: ["hybrid", "hev", "plug-in hybrid", "phev"],
};

export const DRIVETRAIN_ALIASES: Record<string, string[]> = {
  awd: ["awd", "all wheel drive", "all-wheel drive"],
  fwd: ["fwd", "front wheel drive", "front-wheel drive"],
  rwd: ["rwd", "rear wheel drive", "rear-wheel drive"],
  "4wd": ["4wd", "four wheel drive", "four-wheel drive"],
};

export const ALL_MAKES = Object.keys(MAKE_ALIASES);

/**
 * Flat list of all canonical vehicle terms for query correction.
 * Only includes canonical forms (not aliases/typos) so that typos are corrected.
 * Used by correctQuery() to identify which tokens need correction.
 */
export const ALL_KNOWN_VEHICLE_TERMS = new Set<string>(
  [
    ...Object.keys(MAKE_ALIASES),
    ...Object.keys(BODY_STYLE_ALIASES),
    ...Object.keys(FUEL_TYPE_ALIASES),
    ...Object.keys(DRIVETRAIN_ALIASES),
  ].map((term) => term.toLowerCase())
);

/**
 * Build reverse maps: alias → canonical for O(1) lookups.
 */
function buildReverseMaps() {
  const makeMap = new Map<string, string>();
  const bodyMap = new Map<string, string>();
  const fuelMap = new Map<string, string>();
  const driveMap = new Map<string, string>();

  for (const [canonical, aliases] of Object.entries(MAKE_ALIASES)) {
    for (const alias of aliases) {
      makeMap.set(alias.toLowerCase(), canonical);
    }
  }

  for (const [canonical, aliases] of Object.entries(BODY_STYLE_ALIASES)) {
    for (const alias of aliases) {
      bodyMap.set(alias.toLowerCase(), canonical);
    }
  }

  for (const [canonical, aliases] of Object.entries(FUEL_TYPE_ALIASES)) {
    for (const alias of aliases) {
      fuelMap.set(alias.toLowerCase(), canonical);
    }
  }

  for (const [canonical, aliases] of Object.entries(DRIVETRAIN_ALIASES)) {
    for (const alias of aliases) {
      driveMap.set(alias.toLowerCase(), canonical);
    }
  }

  return { makeMap, bodyMap, fuelMap, driveMap };
}

export const REVERSE_MAPS = buildReverseMaps();
