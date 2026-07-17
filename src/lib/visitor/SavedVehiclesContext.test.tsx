import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VisitorAuthProvider } from "./VisitorAuthContext";
import {
  SAVED_VEHICLE_STORAGE_KEY,
  SavedVehiclesProvider,
  readSavedVehicleIds,
  synchronizeSavedVehicleIds,
  useSavedVehicles,
  writeSavedVehicleIds,
} from "./SavedVehiclesContext";
import type { VisitorClient } from "./visitorClient";

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

  it("keeps only failed anonymous IDs for a later authenticated retry", async () => {
    const storage = storageWith(null);
    const attempted: string[] = [];
    const retryIds = await synchronizeSavedVehicleIds(["vehicle-1", "vehicle-2", "vehicle-1"], async (id) => {
      attempted.push(id);
      if (id === "vehicle-2") throw new Error("temporarily unavailable");
    }, storage);
    expect(attempted).toEqual(["vehicle-1", "vehicle-2"]);
    expect(retryIds).toEqual(["vehicle-2"]);
    expect(readSavedVehicleIds(storage)).toEqual(["vehicle-2"]);
  });
});

const visitor = {
  id: "visitor-1",
  email: "visitor@example.com",
  firstName: "Visitor",
  lastName: "Example",
  createdAt: "2026-07-17T00:00:00.000Z",
};

function SavedVehiclesProbe() {
  const { savedIds, toggleSaved } = useSavedVehicles();
  return (
    <>
      <output>{savedIds.join(",") || "none"}</output>
      <button type="button" onClick={() => void toggleSaved("vehicle-2")}>Save vehicle</button>
    </>
  );
}

describe("SavedVehiclesProvider", () => {
  it("uses the authenticated visitor API instead of a second local saved-vehicle state", async () => {
    const getSavedVehicles = vi.fn()
      .mockResolvedValueOnce([{
        id: "save-1",
        vehicleId: "vehicle-1",
        savedAt: "2026-07-17T00:00:00.000Z",
        year: 2026,
        make: "Lume",
        model: "One",
        trim: null,
        price: null,
        status: "live" as const,
        imageSrc: null,
      }])
      .mockResolvedValueOnce([{
        id: "save-1",
        vehicleId: "vehicle-1",
        savedAt: "2026-07-17T00:00:00.000Z",
        year: 2026,
        make: "Lume",
        model: "One",
        trim: null,
        price: null,
        status: "live" as const,
        imageSrc: null,
      }, {
        id: "save-2",
        vehicleId: "vehicle-2",
        savedAt: "2026-07-17T00:01:00.000Z",
        year: 2026,
        make: "Lume",
        model: "Two",
        trim: null,
        price: null,
        status: "live" as const,
        imageSrc: null,
      }]);
    const saveVehicle = vi.fn().mockResolvedValue({ created: true });
    const client: VisitorClient = {
      signup: vi.fn().mockResolvedValue({ visitorId: visitor.id }),
      login: vi.fn().mockResolvedValue(visitor),
      logout: vi.fn().mockResolvedValue(undefined),
      getMe: vi.fn().mockResolvedValue(visitor),
      getLoyalty: vi.fn().mockResolvedValue({ points: 0, tier: null, transactions: [] }),
      getSavedVehicles,
      saveVehicle,
      removeSavedVehicle: vi.fn().mockResolvedValue(undefined),
    };

    render(
      <VisitorAuthProvider client={client}>
        <SavedVehiclesProvider client={client}>
          <SavedVehiclesProbe />
        </SavedVehiclesProvider>
      </VisitorAuthProvider>,
    );

    await screen.findByText("vehicle-1");
    fireEvent.click(screen.getByRole("button", { name: "Save vehicle" }));

    await waitFor(() => expect(saveVehicle).toHaveBeenCalledWith("vehicle-2"));
    await screen.findByText("vehicle-1,vehicle-2");
  });
});
