import { describe, expect, it } from "vitest";
import {
  VEHICLE_MAKE_LOGOS,
  lookupMakeLogo,
  makeMonogram,
  normalizeMakeKey,
} from "./vehicleMakeLogos";

describe("vehicle make logo manifest", () => {
  it("has unique makes and slugs", () => {
    const makes = VEHICLE_MAKE_LOGOS.map((l) => l.make);
    const slugs = VEHICLE_MAKE_LOGOS.map((l) => l.slug);
    expect(new Set(makes).size).toBe(makes.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  // The manifest is the licence record. An entry without provenance is one we
  // cannot defend later, so this is a hard requirement, not documentation.
  it("records provenance for every asset", () => {
    for (const logo of VEHICLE_MAKE_LOGOS) {
      expect(logo.sourceUrl, `${logo.make}: sourceUrl`).toMatch(/^https:\/\//);
      expect(logo.license.trim().length, `${logo.make}: license`).toBeGreaterThan(0);
      expect(logo.trademarkOwner.trim().length, `${logo.make}: owner`).toBeGreaterThan(0);
    }
  });

  it("only ships CC0 or public-domain artwork", () => {
    for (const logo of VEHICLE_MAKE_LOGOS) {
      expect(["CC0-1.0", "CC0", "Public domain"], `${logo.make}`).toContain(logo.license);
    }
  });

  // Proportions must be preserved — a missing or malformed viewBox is how a
  // mark ends up stretched, which is the one thing trademark use must not do.
  it("gives every logo a well-formed viewBox and at least one path", () => {
    for (const logo of VEHICLE_MAKE_LOGOS) {
      expect(logo.viewBox, `${logo.make}: viewBox`).toMatch(
        /^-?[\d.]+ -?[\d.]+ -?[\d.]+ -?[\d.]+$/,
      );
      expect(logo.paths.length, `${logo.make}: paths`).toBeGreaterThan(0);
      for (const d of logo.paths) expect(d.trim().length).toBeGreaterThan(0);
    }
  });

  it("carries no hardcoded colour, so currentColor governs light and dark", () => {
    const serialized = JSON.stringify(VEHICLE_MAKE_LOGOS);
    expect(serialized).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(serialized.toLowerCase()).not.toContain("fill=");
  });
});

describe("lookupMakeLogo", () => {
  it("finds makes exactly as stored on vehicles.make", () => {
    expect(lookupMakeLogo("TOYOTA")?.slug).toBe("toyota");
    expect(lookupMakeLogo("MERCEDES-BENZ")?.slug).toBe("mercedes-benz");
  });

  // Feed data is not clean: the same marque arrives hyphenated, spaced and
  // in mixed case from different sources.
  it("tolerates the spellings real feeds produce", () => {
    for (const spelling of ["Mercedes-Benz", "mercedes benz", "  MERCEDES   BENZ  "]) {
      expect(lookupMakeLogo(spelling)?.slug, spelling).toBe("mercedes-benz");
    }
    expect(lookupMakeLogo("land rover")?.slug).toBe("land-rover");
  });

  it("returns null rather than guessing for uncurated makes", () => {
    // Deliberately excluded pending a legible silhouette / identity check.
    expect(lookupMakeLogo("DODGE")).toBeNull();
    expect(lookupMakeLogo("GENESIS")).toBeNull();
    expect(lookupMakeLogo("NOT A REAL MAKE")).toBeNull();
    expect(lookupMakeLogo("")).toBeNull();
    expect(lookupMakeLogo(null)).toBeNull();
  });
});

describe("makeMonogram", () => {
  it("uses initials for multi-word marques", () => {
    expect(makeMonogram("Land Rover")).toBe("LR");
    expect(makeMonogram("MERCEDES-BENZ")).toBe("MB");
  });

  it("uses the first two characters otherwise", () => {
    expect(makeMonogram("Dodge")).toBe("DO");
    expect(makeMonogram("GENESIS")).toBe("GE");
  });

  // Never empty: a collapsed chip would break the row rhythm the fallback
  // exists to preserve.
  it("always returns something renderable", () => {
    for (const value of ["", "   ", null, undefined]) {
      expect(makeMonogram(value).length).toBeGreaterThan(0);
    }
  });
});

describe("normalizeMakeKey", () => {
  it("collapses separators and case", () => {
    expect(normalizeMakeKey("  rolls-royce ")).toBe("ROLLS ROYCE");
    expect(normalizeMakeKey("land_rover")).toBe("LAND ROVER");
  });
});
