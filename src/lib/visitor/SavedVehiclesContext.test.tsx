import { describe, expect, it } from "vitest";
import { SAVED_VEHICLE_STORAGE_KEY, readSavedVehicleIds, writeSavedVehicleIds } from "./SavedVehiclesContext";

function storageWith(value: string | null) {
  const values = new Map<string, string>();
  if (value !== null) values.set(SAVED_VEHICLE_STORAGE_KEY, value);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, next: string) => { values.set(key, next); },
  } as Storage;
}

describe("saved vehicle local storage", () => {
  it("keeps anonymous saves functional and de-duplicates IDs", () => {
    const storage = storageWith('["vehicle-1", "vehicle-1", 2]');
    expect(readSavedVehicleIds(storage)).toEqual(["vehicle-1"]);
    writeSavedVehicleIds(["vehicle-1", "vehicle-2", "vehicle-1"], storage);
    expect(readSavedVehicleIds(storage)).toEqual(["vehicle-1", "vehicle-2"]);
  });

  it("fails safely for malformed legacy local storage", () => {
    expect(readSavedVehicleIds(storageWith("not json"))).toEqual([]);
  });
});
