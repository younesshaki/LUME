import { describe, expect, it } from "vitest";
import {
  resolveFeedVehicleImageUrls,
  selectFeedVehicleImageUrls,
} from "./feedVehicleImages";

describe("feed vehicle image resolution", () => {
  it("keeps the legacy primary first, preserves order, filters unsafe URLs, and de-duplicates", () => {
    expect(resolveFeedVehicleImageUrls({
      image_src: "https://images.example/primary.jpg",
      feed_image_urls: [
        "https://images.example/primary.jpg",
        "http://images.example/insecure.jpg",
        "https://images.example/second.jpg",
        "not-a-url",
      ],
    })).toEqual([
      "https://images.example/primary.jpg",
      "https://images.example/second.jpg",
    ]);
  });

  it("only permits importing URLs that belong to the current vehicle", () => {
    const source = {
      image_src: "https://images.example/primary.jpg",
      feed_image_urls: ["https://images.example/second.jpg"],
    };
    expect(selectFeedVehicleImageUrls(source, [
      "https://images.example/second.jpg",
      "https://attacker.example/image.jpg",
      "https://images.example/second.jpg",
    ])).toEqual(["https://images.example/second.jpg"]);
  });
});
