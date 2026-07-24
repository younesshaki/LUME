import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublishedPage } from "@lume/types";

// jsdom's localStorage in this vitest setup has no working setItem — stub an
// in-memory one before any module computes preview mode or compare ids.
const memoryStore = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => void memoryStore.set(key, value),
    removeItem: (key: string) => void memoryStore.delete(key),
    clear: () => memoryStore.clear(),
  },
});

const fetchPublishedPageMock = vi.fn();
const resolveTenantIdMock = vi.fn();

vi.mock("@lume/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lume/db")>();
  return { ...actual, fetchPublishedPage: fetchPublishedPageMock };
});

vi.mock("@/lib/publicTenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/publicTenant")>();
  return {
    ...actual,
    publicTenantSlug: "default",
    resolveTenantId: resolveTenantIdMock,
  };
});

const TEST_VEHICLE = {
  id: "veh-1",
  tenantId: "tenant-1",
  stockType: "Used",
  year: 2024,
  make: "Porsche",
  model: "911",
  trim: "Carrera",
  price: 125_000,
  mileage: 8_000,
  bodyStyle: "Coupe",
  exteriorColor: "Black",
  interiorColor: "Black",
  drivetrain: "RWD",
  fuelType: "Gasoline",
  imageSrc: "",
  sellerCity: "Miami",
  sellerState: "FL",
  isSpecial: false,
  status: "live",
  soldAt: null,
  soldPrice: null,
} as const;

vi.mock("@/experience/vehicles/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/experience/vehicles/catalog")>();
  return {
    ...actual,
    loadVehicleById: vi.fn().mockResolvedValue({ vehicle: TEST_VEHICLE, images: [] }),
    loadVehiclePriceSignal: vi.fn().mockResolvedValue(null),
  };
});

vi.mock("@/lib/visitor/SavedVehiclesContext", () => ({
  useSavedVehicles: () => ({
    savedIds: [],
    toggleSaved: vi.fn().mockResolvedValue(true),
    error: null,
  }),
}));
vi.mock("@/lib/sound", () => ({ useSound: () => ({ play: vi.fn() }) }));
vi.mock("@/lib/useConciergeTarget", () => ({ useConciergeTarget: vi.fn() }));
vi.mock("@/lib/leads", () => ({ submitLead: vi.fn() }));
vi.mock("@/lib/conversionAnalytics", () => ({ trackConversion: vi.fn() }));

function publishedVehiclePage(blocks: PublishedPage["blocks"]["blocks"]): PublishedPage {
  return {
    id: "page-1",
    slug: "vehicle",
    title: "Vehicle",
    seoMeta: {},
    publishedRevisionId: "revision-1",
    blocks: { version: 1, blocks },
  };
}

async function renderVehicleRoute(
  fetchResult: PublishedPage | null | Promise<PublishedPage | null>,
) {
  vi.resetModules();
  vi.stubEnv("VITE_PAGE_RENDERER", "true");
  fetchPublishedPageMock.mockImplementation(() => Promise.resolve(fetchResult));
  resolveTenantIdMock.mockResolvedValue("tenant-1");
  const [{ default: VehicleDetailPageRendererRoute }, { DualModeProvider }, { SeoProvider }] =
    await Promise.all([
      import("./VehicleDetailPageRendererRoute"),
      import("@/lib/DualModeContext"),
      import("@/lib/seo/SeoProvider"),
    ]);
  return render(
    <SeoProvider pathname="/vehicles/veh-1">
      <DualModeProvider>
        <MemoryRouter initialEntries={["/vehicles/veh-1"]}>
          <Routes>
            <Route
              path="/vehicles/:vehicleId"
              element={
                <VehicleDetailPageRendererRoute
                  vehicleId="veh-1"
                  onBackToVehicles={vi.fn()}
                  onGoHome={vi.fn()}
                  onNavigateToProducts={vi.fn()}
                  onNavigateToShowcase={vi.fn()}
                  onNavigateToContact={vi.fn()}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </DualModeProvider>
    </SeoProvider>,
  );
}

describe("VehicleDetailPageRendererRoute", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("renders the hardcoded VDP unchanged when no vehicle page is published", async () => {
    await renderVehicleRoute(null);

    await screen.findByRole("heading", { name: "2024 Porsche 911" });
    expect(screen.getByText("Marketplace Concept")).toBeInTheDocument();
    expect(screen.getByText("Mileage")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request info" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to results" })).toBeInTheDocument();
  });

  it("never delays the fallback while the page-builder lookup is in flight", async () => {
    await renderVehicleRoute(new Promise(() => undefined));

    // loadingFallback is the fallback itself: the detail content is visible
    // immediately, not a loading spinner for the page document.
    await screen.findByRole("heading", { name: "2024 Porsche 911" });
    expect(screen.getByText("Marketplace Concept")).toBeInTheDocument();
  });

  it("renders a published vehicle-detail block with the overview and section toggles", async () => {
    await renderVehicleRoute(
      publishedVehiclePage([
        {
          id: "vdp-1",
          type: "vehicle-detail",
          props: {
            eyebrow: "Certified Pre-Owned",
            overviewTitle: "Our promise",
            overviewText: "Every vehicle passes a 160-point inspection.",
            showSpecs: false,
          },
        },
      ]),
    );

    await screen.findByRole("heading", { name: "2024 Porsche 911" });
    expect(screen.getByText("Certified Pre-Owned")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Our promise" })).toBeInTheDocument();
    expect(screen.getByText("Every vehicle passes a 160-point inspection.")).toBeInTheDocument();
    // Specs are hidden by the block props; the action row is untouched.
    expect(screen.queryByText("Mileage")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request info" })).toBeInTheDocument();
    // The fallback's hardcoded eyebrow is replaced, not duplicated.
    expect(screen.queryByText("Marketplace Concept")).not.toBeInTheDocument();
  });
});
