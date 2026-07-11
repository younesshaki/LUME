import { describe, expect, it } from "vitest";
import {
  createVehicleImageUploadItems,
  vehicleImageUploadReducer,
} from "./vehicleImageUploadState";

describe("vehicle image upload state", () => {
  it("accepts only the remaining vehicle slots", () => {
    let id = 0;
    const files = [
      new File(["a"], "a.jpg", { type: "image/jpeg" }),
      new File(["b"], "b.jpg", { type: "image/jpeg" }),
      new File(["c"], "c.jpg", { type: "image/jpeg" }),
    ];
    const result = createVehicleImageUploadItems(files, 2, () => `id-${++id}`);
    expect(result.items.map((item) => item.id)).toEqual(["id-1", "id-2"]);
    expect(result.rejectedCount).toBe(1);
  });

  it("clamps progress and retains independent file outcomes", () => {
    const file = new File(["a"], "a.jpg", { type: "image/jpeg" });
    const initial = createVehicleImageUploadItems([file], 1, () => "one").items;
    const uploading = vehicleImageUploadReducer(initial, {
      type: "progress",
      id: "one",
      progress: 120,
    });
    expect(uploading[0]).toMatchObject({ progress: 100, status: "uploading" });
    expect(vehicleImageUploadReducer(uploading, { type: "complete", id: "one" })[0])
      .toMatchObject({ progress: 100, status: "complete", error: null });
    expect(vehicleImageUploadReducer(uploading, {
      type: "error",
      id: "one",
      error: "failed",
    })[0]).toMatchObject({ status: "error", error: "failed" });
  });
});
