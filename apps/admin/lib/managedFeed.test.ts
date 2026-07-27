import { describe, expect, it } from "vitest";
import {
  MAX_MANAGED_FEED_MAPPINGS,
  materializeManagedFeedCreate,
  materializeManagedFeedUpdate,
  parseManagedFeed,
  preflightManagedFeedIdentities,
  type ManagedFeedMappedRecord,
  validateManagedFeedProfile,
} from "./managedFeed";

describe("validateManagedFeedProfile", () => {
  it("accepts a bounded declarative profile and defaults to hybrid mode", () => {
    const result = validateManagedFeedProfile({
      format: "csv",
      delimiter: ";",
      mappings: {
        feed_vin: { path: "VIN" },
        external_id: { path: "Stock #" },
      },
    });

    expect(result.issues).toEqual([]);
    expect(result.profile).toEqual({
      format: "csv",
      delimiter: ";",
      mode: "hybrid",
      mappings: {
        feed_vin: { path: "VIN" },
        external_id: { path: "Stock #" },
      },
    });
  });

  it("rejects executable/unbounded profile shapes instead of silently ignoring them", () => {
    const result = validateManagedFeedProfile({
      format: "json",
      dataPath: "inventory.__proto__.vehicles",
      script: "$eval(vehicle)",
      mappings: {
        feed_vin: { path: "vin", expression: "$lookup()" },
        unknown_field: { path: "anything" },
      },
    });

    expect(result.profile).toBeNull();
    expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      "script",
      "dataPath",
      "mappings.feed_vin.expression",
      "mappings.unknown_field",
    ]));
  });

  it("requires a stable identity mapping and limits mapping count", () => {
    const tooManyMappings = Object.fromEntries(
      Array.from({ length: MAX_MANAGED_FEED_MAPPINGS + 1 }, (_, index) => [
        `field_${index}`,
        { path: "value" },
      ]),
    );
    const result = validateManagedFeedProfile({
      format: "csv",
      dataPath: "not-supported",
      mappings: tooManyMappings,
    });

    expect(result.profile).toBeNull();
    expect(result.issues.map((issue) => issue.message).join(" ").toLowerCase()).toContain("identity");
    expect(result.issues.map((issue) => issue.message).join(" ")).toContain("at most");
    expect(result.issues.map((issue) => issue.path)).toContain("dataPath");
  });
});

describe("parseManagedFeed", () => {
  const csvProfile = {
    format: "csv",
    delimiter: ";",
    mappings: {
      feed_vin: { path: "VIN" },
      external_id: { path: "Stock #" },
      year: { path: "Year" },
      make: { path: "Make" },
      model: { path: "Model" },
      price: { path: "Price" },
      image_list: { path: "Images" },
    },
  } as const;

  it("parses delimiter-aware CSV and preserves the established create normalizer", () => {
    const result = parseManagedFeed(
      csvProfile,
      [
        "VIN;Stock #;Year;Make;Model;Price;Images",
        '4T1DAACK4TU663212;OW26220;2026;Toyota;Camry;"$38,288";"https://img.example/1.jpg,https://img.example/2.jpg"',
      ].join("\n"),
    );

    expect(result.issues).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      index: 0,
      sourceLine: 2,
      fields: {
        feed_vin: "4T1DAACK4TU663212",
        external_id: "OW26220",
        year: "2026",
        make: "Toyota",
        model: "Camry",
        price: "$38,288",
      },
    });

    const materialized = materializeManagedFeedCreate(result.records[0]!);
    expect(materialized.errors).toEqual([]);
    expect(materialized.row).toMatchObject({
      feed_vin: "4T1DAACK4TU663212",
      external_id: "OW26220",
      year: 2026,
      make: "Toyota",
      model: "Camry",
      price: 38288,
      feed_image_urls: ["https://img.example/1.jpg", "https://img.example/2.jpg"],
    });
  });

  it("represents empty mapped values differently for hybrid and mirror updates", () => {
    const source = "VIN,Stock,Price\n4T1DAACK4TU663212,OW26220,";
    const baseProfile = {
      format: "csv",
      mappings: {
        feed_vin: { path: "VIN" },
        external_id: { path: "Stock" },
        price: { path: "Price" },
      },
    } as const;

    const hybrid = parseManagedFeed(baseProfile, source);
    const mirror = parseManagedFeed({ ...baseProfile, mode: "mirror" }, source);

    expect(hybrid.records[0]?.presentFields).toEqual(["feed_vin", "external_id"]);
    expect(hybrid.records[0]?.fields).not.toHaveProperty("price");
    expect(mirror.records[0]?.presentFields).toEqual(["feed_vin", "external_id", "price"]);
    expect(mirror.records[0]?.fields.price).toBeNull();
  });

  it("parses JSON data paths and normalizes mapped image arrays with a safe comma join", () => {
    const result = parseManagedFeed(
      {
        format: "json",
        dataPath: "payload.vehicles",
        mappings: {
          feed_vin: { path: "identity.vin" },
          external_id: { path: "stock" },
          make: { path: "make" },
          image_list: { path: "photos" },
        },
      },
      JSON.stringify({
        payload: {
          vehicles: [{
            identity: { vin: "4T1DAACK4TU663212" },
            stock: "OW26220",
            make: "Toyota",
            photos: ["https://img.example/1.jpg", "https://img.example/2.jpg"],
          }],
        },
      }),
    );

    expect(result.issues).toEqual([]);
    expect(result.records[0]?.fields).toMatchObject({
      feed_vin: "4T1DAACK4TU663212",
      external_id: "OW26220",
      make: "Toyota",
      image_list: "https://img.example/1.jpg,https://img.example/2.jpg",
    });

    expect(materializeManagedFeedUpdate(result.records[0]!).update).toMatchObject({
      image_src: "https://img.example/1.jpg",
      feed_image_urls: ["https://img.example/1.jpg", "https://img.example/2.jpg"],
    });
  });

  it("rejects non-comma joins for image galleries so URLs cannot be silently lost", () => {
    const result = validateManagedFeedProfile({
      format: "json",
      mappings: {
        external_id: { path: "stock" },
        image_list: { path: "photos", join: "|" },
      },
    });

    expect(result.profile).toBeNull();
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "mappings.image_list.join" }),
    ]));
  });

  it("parses XML data paths, repeated elements, and bounded attribute paths", () => {
    const result = parseManagedFeed(
      {
        format: "xml",
        dataPath: "inventory.vehicles.vehicle",
        mappings: {
          feed_vin: { path: "vin" },
          external_id: { path: "@stock" },
          make: { path: "make" },
          image_list: { path: "images.image" },
        },
      },
      [
        '<inventory><vehicles><vehicle stock="OW26220">',
        "<vin>4T1DAACK4TU663212</vin><make>Toyota</make>",
        "<images><image>https://img.example/1.jpg</image><image>https://img.example/2.jpg</image></images>",
        "</vehicle></vehicles></inventory>",
      ].join(""),
    );

    expect(result.issues).toEqual([]);
    expect(result.records[0]?.fields).toMatchObject({
      feed_vin: "4T1DAACK4TU663212",
      external_id: "OW26220",
      make: "Toyota",
      image_list: "https://img.example/1.jpg,https://img.example/2.jpg",
    });
  });

  it("decodes supported XML entities without accepting arbitrary entities", () => {
    const result = parseManagedFeed(
      {
        format: "xml",
        dataPath: "inventory.vehicle",
        mappings: {
          external_id: { path: "stock" },
          make: { path: "make" },
        },
      },
      "<inventory><vehicle><stock>OW&amp;26220</stock><make>Toyota &amp; Lexus</make></vehicle></inventory>",
    );

    expect(result.issues).toEqual([]);
    expect(result.records[0]?.fields).toMatchObject({
      external_id: "OW&26220",
      make: "Toyota & Lexus",
    });
  });

  it("rejects DTD/entity XML rather than attempting to resolve it", () => {
    const result = parseManagedFeed(
      {
        format: "xml",
        dataPath: "inventory.vehicle",
        mappings: { external_id: { path: "stock" } },
      },
      '<!DOCTYPE inventory [<!ENTITY secret SYSTEM "file:///etc/passwd">]><inventory><vehicle><stock>&secret;</stock></vehicle></inventory>',
    );

    expect(result.records).toEqual([]);
    expect(result.issues[0]).toMatchObject({ code: "invalid_source" });
    expect(result.issues[0]?.message).toContain("DTD");
  });

  it("reports malformed CSV instead of silently moving values into a different field", () => {
    const result = parseManagedFeed(
      { format: "csv", mappings: { external_id: { path: "Stock" } } },
      'Stock,Make\nOW26220,"Toyota',
    );

    expect(result.records).toEqual([]);
    expect(result.issues[0]).toMatchObject({ code: "invalid_source" });
    expect(result.issues[0]?.message).toContain("unterminated");
  });

  it("keeps a valid row independently addressable after a malformed CSV sibling", () => {
    const result = parseManagedFeed(
      { format: "csv", mappings: { external_id: { path: "Stock" } } },
      ["Stock", "BAD-ROW,EXTRA", "GOOD-2"].join("\n"),
    );

    expect(result.issues).toEqual([
      expect.objectContaining({ code: "invalid_record", recordIndex: 0, sourceLine: 2 }),
    ]);
    expect(result.records).toEqual([
      expect.objectContaining({ index: 1, sourceLine: 3, fields: { external_id: "GOOD-2" } }),
    ]);
  });

  it("does not renumber JSON records after an invalid selected value", () => {
    const result = parseManagedFeed(
      {
        format: "json",
        dataPath: "vehicles",
        mappings: { external_id: { path: "stock" } },
      },
      JSON.stringify({ vehicles: ["not-a-vehicle", { stock: "GOOD-2" }] }),
    );

    expect(result.issues).toEqual([
      expect.objectContaining({ code: "invalid_record", recordIndex: 0, sourceLine: 1 }),
    ]);
    expect(result.records).toEqual([
      expect.objectContaining({ index: 1, sourceLine: 2, fields: { external_id: "GOOD-2" } }),
    ]);
  });
});

describe("preflightManagedFeedIdentities", () => {
  it("flags same-source duplicate VINs and cross-identity conflicts before any sync occurs", () => {
    const parsed = parseManagedFeed(
      {
        format: "csv",
        mappings: {
          feed_vin: { path: "VIN" },
          external_id: { path: "Stock" },
        },
      },
      [
        "VIN,Stock,Label",
        "4T1DAACK4TU663212,OW26220",
        "4T1DAACK4TU663212,OW26220",
        "4T1DAACK4TU663212,DIFFERENT-STOCK",
        "1HGCM82633A004352,OW26220",
        ",,Unidentified",
      ].join("\n"),
    );

    const preflight = preflightManagedFeedIdentities(parsed.records);

    expect(preflight.validRecordIndexes).toEqual([0]);
    expect(preflight.issues.map((issue) => issue.code)).toEqual([
      "duplicate_vin",
      "identity_conflict",
      "identity_conflict",
      "missing_identity",
    ]);
    expect(preflight.issues[1]).toMatchObject({
      recordIndex: 2,
      relatedRecordIndex: 0,
      sourceLine: 4,
      relatedSourceLine: 2,
    });
  });

  it("allows a record to be identified by stock when a valid VIN is absent, but rejects malformed VINs", () => {
    const parsed = parseManagedFeed(
      {
        format: "csv",
        mappings: {
          feed_vin: { path: "VIN" },
          external_id: { path: "Stock" },
        },
      },
      ["VIN,Stock", ",OW26220", "NOT-A-VIN,OW26221"].join("\n"),
    );

    const preflight = preflightManagedFeedIdentities(parsed.records);
    expect(preflight.validRecordIndexes).toEqual([0]);
    expect(preflight.issues).toHaveLength(1);
    expect(preflight.issues[0]).toMatchObject({ code: "invalid_vin", recordIndex: 1 });
  });

  it("flags a duplicate external ID even when the feed does not provide VINs", () => {
    const parsed = parseManagedFeed(
      {
        format: "csv",
        mappings: { external_id: { path: "Stock" } },
      },
      ["Stock", "OW26220", "ow26220"].join("\n"),
    );

    const preflight = preflightManagedFeedIdentities(parsed.records);
    expect(preflight.validRecordIndexes).toEqual([0]);
    expect(preflight.issues).toHaveLength(1);
    expect(preflight.issues[0]).toMatchObject({
      code: "duplicate_external_id",
      recordIndex: 1,
      relatedRecordIndex: 0,
    });
  });
});

describe("materializeManagedFeedUpdate", () => {
  it("normalizes only explicitly present fields without leaking required parser placeholders", () => {
    const parsed = parseManagedFeed(
      {
        format: "csv",
        mappings: {
          external_id: { path: "Stock" },
          price: { path: "Price" },
          mileage: { path: "Miles" },
        },
      },
      'Stock,Price,Miles\nOW26220,"$38,288","12,345 MILES"',
    );

    const materialized = materializeManagedFeedUpdate(parsed.records[0]!);
    expect(materialized.errors).toEqual([]);
    expect(materialized.nullClears).toEqual([]);
    expect(materialized.update).toEqual({
      external_id: "OW26220",
      price: 38288,
      mileage: 12345,
    });
    expect(materialized.update).not.toHaveProperty("year");
    expect(materialized.update).not.toHaveProperty("make");
  });

  it("normalizes every present supplier-gallery input into one image_src/feed_image_urls patch", () => {
    const parsed = parseManagedFeed(
      {
        format: "csv",
        mappings: {
          external_id: { path: "Stock" },
          image_src: { path: "Primary" },
          additional_image_link: { path: "Additional" },
        },
      },
      "Stock,Primary,Additional\nOW26220,https://img.example/1.jpg,\"https://img.example/2.jpg,https://img.example/1.jpg\"",
    );

    const materialized = materializeManagedFeedUpdate(parsed.records[0]!);
    expect(materialized.errors).toEqual([]);
    expect(materialized.update).toEqual({
      external_id: "OW26220",
      image_src: "https://img.example/1.jpg",
      feed_image_urls: ["https://img.example/1.jpg", "https://img.example/2.jpg"],
    });
    expect(materialized.update).not.toHaveProperty("image_list");
    expect(materialized.update).not.toHaveProperty("additional_image_link");
  });

  it("reports mirror-mode optional null clears and requires an explicit caller opt-in to apply them", () => {
    const record: ManagedFeedMappedRecord = {
      index: 0,
      sourceLine: 2,
      fields: {
        mileage: null,
        image_list: null,
      },
      presentFields: ["mileage", "image_list"],
    };

    const deferred = materializeManagedFeedUpdate(record);
    expect(deferred.errors).toEqual([]);
    expect(deferred.update).toEqual({});
    expect(deferred.nullClears).toEqual(["mileage", "feed_gallery"]);

    const applied = materializeManagedFeedUpdate(record, { applyNullClears: true });
    expect(applied.errors).toEqual([]);
    expect(applied.nullClears).toEqual(["mileage", "feed_gallery"]);
    expect(applied.update).toEqual({
      mileage: null,
      image_src: "",
      feed_image_urls: [],
    });
  });

  it("never clears a VIN or stock identity during a mirror update", () => {
    const record: ManagedFeedMappedRecord = {
      index: 0,
      sourceLine: 2,
      fields: { external_id: null },
      presentFields: ["external_id"],
    };

    expect(materializeManagedFeedUpdate(record, { applyNullClears: true })).toMatchObject({
      update: {},
      errors: ["external_id cannot be cleared because LUME requires a value."],
    });
  });

  it("rejects invalid present values rather than trusting raw feed text", () => {
    const invalidPrice: ManagedFeedMappedRecord = {
      index: 0,
      sourceLine: 2,
      fields: { price: "call for price" },
      presentFields: ["price"],
    };
    const unsafeImage: ManagedFeedMappedRecord = {
      index: 1,
      sourceLine: 3,
      fields: { image_src: "http://127.0.0.1/private.jpg" },
      presentFields: ["image_src"],
    };
    const requiredNull: ManagedFeedMappedRecord = {
      index: 2,
      sourceLine: 4,
      fields: { make: null },
      presentFields: ["make"],
    };

    expect(materializeManagedFeedUpdate(invalidPrice)).toMatchObject({
      update: {},
      errors: [expect.stringContaining("invalid price")],
    });
    expect(materializeManagedFeedUpdate(unsafeImage)).toMatchObject({
      update: {},
      errors: [expect.stringContaining("unsafe")],
    });
    expect(materializeManagedFeedUpdate(requiredNull)).toMatchObject({
      update: {},
      errors: [expect.stringContaining("make cannot be cleared")],
    });
  });
});
