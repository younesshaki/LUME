import { describe, expect, it } from "vitest";
import {
  MAX_VEHICLE_IMAGE_BYTES,
  buildVehicleImageR2Key,
  isExpectedVehicleImageR2Key,
  parseVehicleImageConfirmation,
  parseVehicleImageUploadRequest,
  vehicleImagePublicUrl,
} from "./vehicleImages";

const vehicleId = "11111111-1111-4111-8111-111111111111";
const imageId = "22222222-2222-4222-8222-222222222222";

describe("vehicle image metadata", () => {
  it("accepts bounded browser upload metadata", () => {
    expect(parseVehicleImageUploadRequest({
      fileName: "front.webp",
      contentType: "image/webp",
      byteSize: 1_024,
    })).toEqual({ fileName: "front.webp", contentType: "image/webp", byteSize: 1_024 });
    expect(parseVehicleImageUploadRequest({
      fileName: "huge.png",
      contentType: "image/png",
      byteSize: MAX_VEHICLE_IMAGE_BYTES + 1,
    })).toBeNull();
    expect(parseVehicleImageUploadRequest({
      fileName: "script.svg",
      contentType: "image/svg+xml",
      byteSize: 100,
    })).toBeNull();
  });

  it("validates confirmation dimensions and metadata", () => {
    expect(parseVehicleImageConfirmation({
      r2Key: `atelier/vehicles/${vehicleId}/${imageId}.jpg`,
      contentType: "image/jpeg",
      byteSize: 500,
      width: 1600,
      height: 900,
    })).toMatchObject({ width: 1600, height: 900 });
    expect(parseVehicleImageConfirmation({
      r2Key: "unsafe/../key.jpg",
      contentType: "image/jpeg",
      byteSize: 500,
      width: 1600,
      height: null,
    })).toBeNull();
  });

  it("builds and scopes R2 keys deterministically", () => {
    const key = buildVehicleImageR2Key("atelier", vehicleId, imageId, "image/png");
    expect(key).toBe(`atelier/vehicles/${vehicleId}/${imageId}.png`);
    expect(isExpectedVehicleImageR2Key(key, "atelier", vehicleId)).toBe(true);
    expect(isExpectedVehicleImageR2Key(key, "other", vehicleId)).toBe(false);
    expect(() => buildVehicleImageR2Key("../other", vehicleId, imageId, "image/png"))
      .toThrow("Invalid tenant slug.");
  });

  it("encodes public object URLs without allowing the key to replace the origin", () => {
    expect(vehicleImagePublicUrl("https://cdn.example/base", "atelier/vehicles/a b/front.jpg"))
      .toBe("https://cdn.example/base/atelier/vehicles/a%20b/front.jpg");
    expect(vehicleImagePublicUrl("not a url", "key")).toBeNull();
  });
});
