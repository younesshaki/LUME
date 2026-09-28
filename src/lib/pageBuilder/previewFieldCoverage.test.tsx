import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { listBlockDescriptors, type BlockDescriptor, type BlockField } from "@lume/blocks";
import type { PageBlock } from "@lume/types";
import { StoryProvider } from "@/experience/story/StoryProvider";
import { SavedVehiclesProvider } from "@/lib/visitor/SavedVehiclesContext";
import { VisitorAuthProvider } from "@/lib/visitor/VisitorAuthContext";
import { getBlockComponent } from "./registry";
import { registerBlocks } from "./registerBlocks";
import { PageBuilderRenderProvider } from "./renderContext";

/**
 * Sprint task A3: every field the page editor offers must visibly change the
 * block in the live preview (which renders through these same components).
 *
 * For each registered block type, render it from a filled-in baseline, then
 * change one editable field at a time and require the rendered output to
 * change. A field that changes nothing is a control that promises the dealer
 * something the site never does — the hero's "Background image key" and
 * "Media URL" were exactly that until 2026-09-28.
 */

const SAMPLE_VEHICLE = vi.hoisted(() => ({
  id: "11111111-1111-4111-8111-111111111111", stockType: "Used", year: 2024, make: "Porsche",
  model: "911", trim: "Carrera", price: 95000, mileage: 8200, bodyStyle: "Coupe",
  exteriorColor: "Black", interiorColor: "Tan", drivetrain: "RWD", fuelType: "Gasoline",
  imageSrc: "", sellerCity: "Monaco", sellerState: "MC", isSpecial: false,
}));

vi.mock("@/lib/leads", () => ({ submitLead: vi.fn() }));
vi.mock("@/experience/vehicles/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/experience/vehicles/catalog")>();
  return {
    ...actual,
    loadVehicleById: vi.fn().mockResolvedValue({ vehicle: SAMPLE_VEHICLE, images: [] }),
    loadVehiclePriceSignal: vi.fn().mockResolvedValue(null),
    loadVehicleFacets: vi.fn().mockResolvedValue({ makes: [], models: [], states: [], cities: [] }),
    loadVehicleResults: vi.fn().mockResolvedValue({
      vehicles: [SAMPLE_VEHICLE], totalCount: 1, hasMore: false,
      facets: { makes: [], models: [], states: [], cities: [] }, source: "api",
    }),
  };
});

/**
 * Values that satisfy a field's own validation rule. A generic value would be
 * rejected by the schema, and the renderer skips invalid blocks entirely.
 */
const VALID_MUTATIONS: Record<string, unknown> = {
  "whatsapp-cta.phone": "+33612345678",
  "featured-vehicles.vehicleIds": ["22222222-2222-4222-8222-222222222222"],
  "review-summary.rating": 3.5,
  "video-embed.videoUrl": "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
  "map-hours.mapEmbedUrl": "https://www.google.com/maps/embed?pb=mutated",
  "footer-contact.email": "sales@mutated.example",
  "product-grid.categories": ["fragrance"],
};
/** Fields that only apply alongside another setting, as their editor label says. */
const PREREQUISITES: Record<string, Record<string, unknown>> = {
  // "Notch / Bento accent colour"
  "vehicle-inventory.cardColor": { cardStyle: "notch" },
  // The photo fields belong to the photo designs ("Shown by the Split,
  // Inventory search and Full-bleed designs"); the classic hero has no photo.
  "hero.mediaUrl": { variant: "split" },
  "hero.mediaAlt": { variant: "split", mediaUrl: "/sample-photo.jpg" },
  "hero.mediaPosition": { variant: "split", mediaUrl: "/sample-photo.jpg" },
  "hero.overlayStrength": { variant: "fullBleed", mediaUrl: "/sample-photo.jpg" },
};
const VALID_ITEM_MUTATIONS: Record<string, Record<string, unknown>> = {
  "logo-marquee.items": { body: "https://images.example/mutated-logo.png" },
  "gallery-masonry.items": { body: "https://images.example/mutated.jpg" },
};

beforeAll(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  });
  const noop = class { observe() {} unobserve() {} disconnect() {} };
  Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, value: noop });
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: noop });
  Object.defineProperty(HTMLElement.prototype, "scrollBy", { configurable: true, value: () => undefined });
  registerBlocks();
});

afterEach(() => cleanup());

function mutated(type: string, field: BlockField, current: unknown): unknown {
  const key = `${type}.${field.name}`;
  if (key in VALID_MUTATIONS) return VALID_MUTATIONS[key];
  switch (field.type) {
    case "text":
    case "textarea":
      return `Mutated ${field.name} value`;
    case "url":
      return `https://mutated.example/${field.name}`;
    case "color":
      return "#123456";
    case "number":
      return (typeof current === "number" ? current : 0) + 3;
    case "boolean":
      return !current;
    case "select":
      return field.options?.find((option) => option.value !== current)?.value ?? current;
    case "string-list":
      return ["Mutated item one", "Mutated item two"];
    case "statement-list": {
      const base = Array.isArray(current) && current[0] && typeof current[0] === "object" ? current[0] : {};
      const item = {
        ...base,
        ...Object.fromEntries(
          (field.itemFields ?? []).map((itemField) => [itemField.name, mutated(type, itemField, undefined)]),
        ),
        ...VALID_ITEM_MUTATIONS[key],
      };
      return [item, ...(Array.isArray(current) ? current.slice(1) : [])];
    }
    default:
      return current;
  }
}

/** Defaults plus a value for every empty text/link field, so paired fields (label + link) show. */
function filledBaseline(descriptor: BlockDescriptor): Record<string, unknown> {
  const props = structuredClone(descriptor.defaultProps) as Record<string, unknown>;
  for (const field of descriptor.fields) {
    if (props[field.name] !== "" && props[field.name] !== undefined) continue;
    if (field.type === "text" || field.type === "textarea") props[field.name] = `Sample ${field.name}`;
    if (field.type === "url") props[field.name] = `/sample-${field.name.toLowerCase()}`;
  }
  return descriptor.validate(props).ok ? props : (structuredClone(descriptor.defaultProps) as Record<string, unknown>);
}

async function renderedHtml(descriptor: BlockDescriptor, props: Record<string, unknown>): Promise<string> {
  const Component = getBlockComponent(descriptor.type)!;
  const block: PageBlock = { id: `${descriptor.type}-1`, type: descriptor.type, props };
  const mode = descriptor.modes.includes("standard") ? "standard" : "experience";
  const view = render(
    <MemoryRouter>
      <PageBuilderRenderProvider value={{ pageSlug: "home", preview: true }}>
        <VisitorAuthProvider>
          <SavedVehiclesProvider>
            <StoryProvider>
              <Component block={block} mode={mode} />
            </StoryProvider>
          </SavedVehiclesProvider>
        </VisitorAuthProvider>
      </PageBuilderRenderProvider>
    </MemoryRouter>,
  );
  // Let async data (sample vehicle, inventory) settle.
  for (let tick = 0; tick < 4; tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  const html = view.container.innerHTML;
  cleanup();
  return html;
}

// Registered at collection time: `it.each` below enumerates the registry.
registerBlocks();
const renderable = () => listBlockDescriptors().filter((descriptor) => getBlockComponent(descriptor.type));

describe("preview: every editable field changes the rendered block", () => {
  it.each(renderable().map((descriptor) => [descriptor.type, descriptor] as const))(
    "%s",
    async (_type, descriptor) => {
      const base = filledBaseline(descriptor);
      const baseline = await renderedHtml(descriptor, base);
      const noEffect: string[] = [];
      const rejected: string[] = [];
      for (const field of descriptor.fields) {
        const prerequisite = PREREQUISITES[`${descriptor.type}.${field.name}`];
        const before = prerequisite ? { ...base, ...prerequisite } : base;
        const reference = prerequisite ? await renderedHtml(descriptor, before) : baseline;
        const props = { ...before, [field.name]: mutated(descriptor.type, field, before[field.name]) };
        const check = descriptor.validate(props);
        if (!check.ok) {
          rejected.push(`${field.name}: ${check.errors.join("; ")}`);
          continue;
        }
        if ((await renderedHtml(descriptor, props)) === reference) noEffect.push(field.name);
      }
      expect(rejected, "test mutation rejected by the schema — add a VALID_MUTATIONS entry").toEqual([]);
      expect(noEffect, "editor fields with no visible effect in the preview").toEqual([]);
    },
    30_000,
  );
});
