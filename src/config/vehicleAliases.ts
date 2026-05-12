/**
 * Vehicle term alias dictionaries.
 *
 * Each canonical term maps to an array of common variations (aliases).
 * These aliases are used for direct matching before falling back to fuzzy
 * matching against the canonical terms.
 */

/**
 * Make aliases.
 * Canonical make name -> list of common alternate spellings / abbreviations.
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
  ferrari: ["ferrari", "ferrari"],
  ford: ["ford", "frd"],
  gmc: ["gmc"],
  genesis: ["genesis"],
  honda: ["honda", "hon"],
  hummer: ["hummer"],
  hyundai: ["hyundai"],
  infiniti: ["infiniti"],
  jaguar: ["jaguar", "jag"],
  jeep: ["jeep"],
  kia: ["kia"],
  lamborghini: ["lamborghini", "lambo"],
  "land rover": ["land rover", "landrover"],
  lexus: ["lexus"],
  lincoln: ["lincoln"],
  mini: ["mini"],
  maserati: ["maserati"],
  mazda: ["mazda"],
  "mercedes-benz": ["mercedes-benz", "mercedes benz", "merc"],
  mitsubishi: ["mitsubishi"],
  nissan: ["nissan"],
  polestar: ["polestar"],
  porsche: ["porsche"],
  ram: ["ram"],
  "rolls-royce": ["rolls-royce", "rolls royce"],
  subaru: ["subaru"],
  tesla: ["tesla"],
  toyota: ["toyota", "toy"],
  volkswagen: ["volkswagen", "vw"],
  volvo: ["volvo"],
};

/**
 * Body style aliases.
 * Canonical body style -> list of common variations.
 */
export const BODY_STYLE_ALIASES: Record<string, string[]> = {
  sedan: ["sedan", "saloon", "four-door"],
  suv: ["suv", "s.u.v.", "sport utility vehicle", "sport utility", "utility vehicle"],
  hatchback: ["hatchback", "hatch"],
  coupe: ["coupe", "coupé"],
  convertible: ["convertible", "cabriolet", "cabrio"],
  truck: ["truck", "pickup", "pick-up", "ute"],
  wagon: ["wagon", "estate", "station wagon"],
  minivan: ["minivan", "mini van", "people carrier"],
  crossover: ["crossover", "cuv"],
};

/**
 * Fuel type aliases.
 * Canonical fuel type -> list of common variations.
 */
export const FUEL_ALIASES: Record<string, string[]> = {
  gasoline: ["gasoline", "gas", "petrol"],
  diesel: ["diesel"],
  electric: ["electric", "ev", "battery", "bev", "battery electric"],
  hybrid: ["hybrid", "hev", "plug-in hybrid", "phev"],
};

/**
 * Drivetrain aliases.
 * Canonical drivetrain -> list of common variations.
 */
export const DRIVETRAIN_ALIASES: Record<string, string[]> = {
  awd: ["awd", "all wheel drive", "all-wheel drive"],
  fwd: ["fwd", "front wheel drive", "front-wheel drive"],
  rwd: ["rwd", "rear wheel drive", "rear-wheel drive"],
  "4wd": ["4wd", "four wheel drive", "four-wheel drive"],
};
