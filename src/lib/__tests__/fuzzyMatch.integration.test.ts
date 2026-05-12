/// <reference types="vitest" />
import { correctQuery, fuzzyLookup, isFuzzyMatch } from "../fuzzyMatch";
import {
  MAKE_ALIASES,
  BODY_STYLE_ALIASES,
  FUEL_TYPE_ALIASES,
  DRIVETRAIN_ALIASES,
  ALL_KNOWN_VEHICLE_TERMS,
} from "../vehicleTerms";
import { describe, test, expect } from "vitest";

describe("Fuzzy Matching Integration Tests", () => {
  describe("Common typos in vehicle makes", () => {
    test('should match "ferari" to "ferrari"', () => {
      const result = fuzzyLookup("ferari", MAKE_ALIASES);
      expect(result).toBe("ferrari");
    });

    test('should match "lamborghni" to "lamborghini"', () => {
      const result = fuzzyLookup("lamborghni", MAKE_ALIASES);
      expect(result).toBe("lamborghini");
    });

    test('should match "teyota" to "toyota"', () => {
      const result = fuzzyLookup("teyota", MAKE_ALIASES);
      expect(result).toBe("toyota");
    });

    test('should match "bimmer" to "bmw"', () => {
      const result = fuzzyLookup("bimmer", MAKE_ALIASES);
      expect(result).toBe("bmw");
    });

    test('should match "lambo" to "lamborghini"', () => {
      const result = fuzzyLookup("lambo", MAKE_ALIASES);
      expect(result).toBe("lamborghini");
    });
  });

  describe("Query preprocessing with correctQuery", () => {
    test("should correct multiple typos in a query", () => {
      const result = correctQuery(
        "ferari lamborghni",
        ALL_KNOWN_VEHICLE_TERMS
      );
      expect(result.corrected).toBe("ferrari lamborghini");
      expect(result.corrections).toHaveLength(2);
    });

    test("should handle mixed correct and typo terms", () => {
      const result = correctQuery(
        "show me teyotas",
        ALL_KNOWN_VEHICLE_TERMS
      );
      expect(result.corrected).toContain("toyota");
      expect(result.corrections.length).toBeGreaterThan(0);
    });
  });

  describe("Body style fuzzy matching", () => {
    test('should match "suv" exactly', () => {
      const result = fuzzyLookup("suv", BODY_STYLE_ALIASES);
      expect(result).toBe("suv");
    });

    test('should match "sedan" exactly', () => {
      const result = fuzzyLookup("sedan", BODY_STYLE_ALIASES);
      expect(result).toBe("sedan");
    });
  });

  describe("Fuel type fuzzy matching", () => {
    test('should match "electrik" to "electric"', () => {
      const result = fuzzyLookup("electrik", FUEL_TYPE_ALIASES);
      expect(result).toBe("electric");
    });

    test('should match "hybrid" exactly', () => {
      const result = fuzzyLookup("hybrid", FUEL_TYPE_ALIASES);
      expect(result).toBe("hybrid");
    });
  });

  describe("Drivetrain fuzzy matching", () => {
    test('should match "awd" exactly', () => {
      const result = fuzzyLookup("awd", DRIVETRAIN_ALIASES);
      expect(result).toBe("awd");
    });

    test('should match "rwd" exactly', () => {
      const result = fuzzyLookup("rwd", DRIVETRAIN_ALIASES);
      expect(result).toBe("rwd");
    });
  });

  describe("Case insensitivity", () => {
    test("should match regardless of case", () => {
      expect(fuzzyLookup("FERRARI", MAKE_ALIASES)).toBe("ferrari");
      expect(fuzzyLookup("FerAri", MAKE_ALIASES)).toBe("ferrari");
      expect(fuzzyLookup("LAMBORGHINI", MAKE_ALIASES)).toBe("lamborghini");
    });
  });
});
