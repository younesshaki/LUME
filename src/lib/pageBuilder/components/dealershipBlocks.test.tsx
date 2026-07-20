import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getBlockDescriptor } from "@lume/blocks";
import type { PageBlock } from "@lume/types";
import { Marquee } from "@/components/ui/marquee";
import { NumberTicker } from "@/components/ui/number-ticker";
import { getBlockComponent } from "../registry";
import { registerBlocks } from "../registerBlocks";
import {
  LeadCaptureForm,
  NewsletterSignup,
  TestDriveBooking,
  TradeInForm,
} from "./DealershipForms";
import { FaqAccordion } from "./DealershipTrust";

const mocks = vi.hoisted(() => ({
  loadVehicleById: vi.fn(),
  loadVehicleFacets: vi.fn(),
  loadVehicleResults: vi.fn(),
  submitLead: vi.fn(),
}));
const motionState = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", async (importOriginal) => ({
  ...await importOriginal<typeof import("motion/react")>(),
  useReducedMotion: () => motionState.reduced,
}));

vi.mock("@/lib/leads", () => ({
  submitLead: mocks.submitLead,
}));

vi.mock("@/experience/vehicles/urlState", () => ({
  encodeVehicleUrlState: (
    filters: { make?: string; model?: string; priceMax?: number },
  ) => {
    const params = new URLSearchParams();
    if (filters.make) params.set("make", filters.make);
    if (filters.model) params.set("model", filters.model);
    if (filters.priceMax) params.set("priceMax", String(filters.priceMax));
    return `#vehicles?${params.toString()}`;
  },
}));

vi.mock("@/experience/vehicles/catalog", () => {
  const defaultFilters = {
    query: "",
    stockType: "",
    make: "",
    model: "",
    bodyStyle: "",
    fuelType: "",
    drivetrain: "",
    sellerState: "",
    sellerCity: "",
    yearMin: 2003,
    yearMax: 2027,
    mileageMax: 0,
    priceMin: 0,
    priceMax: 0,
  };
  return {
    DEFAULT_FILTERS: defaultFilters,
    formatVehiclePrice: (price: number) => `$${price.toLocaleString("en-US")}`,
    loadVehicleById: mocks.loadVehicleById,
    loadVehicleFacets: mocks.loadVehicleFacets,
    loadVehicleResults: mocks.loadVehicleResults,
    vehicleDisplayImage: (vehicle: { primaryImageSrc?: string; imageSrc?: string }) =>
      vehicle.primaryImageSrc || vehicle.imageSrc || "",
  };
});

const DEALERSHIP_BLOCK_TYPES = [
  "trade-in-form",
  "finance-calculator",
  "test-drive-booking",
  "lead-capture-form",
  "whatsapp-cta",
  "cta-banner",
  "announcement-bar",
  "newsletter-signup",
  "featured-vehicles",
  "new-arrivals",
  "vehicle-search-band",
  "vehicle-spec-table",
  "testimonials",
  "review-summary",
  "trust-stats",
  "logo-marquee",
  "services-list",
  "how-it-works",
  "faq-accordion",
  "team-grid",
  "split-feature",
  "video-embed",
  "gallery-masonry",
  "map-hours",
  "footer-contact",
] as const;

const vehicle = {
  id: "vehicle-one",
  stockType: "Used",
  year: 2024,
  make: "Porsche",
  model: "911",
  trim: "Carrera",
  price: 95_000,
  mileage: 8_200,
  bodyStyle: "Coupe",
  exteriorColor: "Black",
  interiorColor: "Tan",
  drivetrain: "RWD",
  fuelType: "Gasoline",
  imageSrc: "",
  primaryImageSrc: "https://cdn.example/vehicle.webp",
  primaryImageAlt: "Black Porsche 911",
  sellerCity: "Monaco",
  sellerState: "MC",
  isSpecial: false,
};

const scrollBy = vi.fn();

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion") && motionState.reduced,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  Object.defineProperty(HTMLElement.prototype, "scrollBy", {
    configurable: true,
    value: scrollBy,
  });
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
});

beforeEach(() => {
  motionState.reduced = false;
  scrollBy.mockClear();
  mocks.submitLead.mockReset().mockResolvedValue({ leadId: "lead-one" });
  mocks.loadVehicleById.mockReset().mockResolvedValue({
    vehicle,
    images: [],
  });
  mocks.loadVehicleFacets.mockReset().mockResolvedValue({
    makes: ["Porsche"],
    models: ["911"],
    states: ["MC"],
    cities: ["Monaco"],
  });
  mocks.loadVehicleResults.mockReset().mockResolvedValue({
    vehicles: [vehicle],
    totalCount: 1,
    hasMore: false,
    facets: {
      makes: ["Porsche"],
      models: ["911"],
      states: ["MC"],
      cities: ["Monaco"],
    },
    source: "api",
  });
  registerBlocks();
});

afterEach(() => {
  cleanup();
});

function defaultBlock(type: string): PageBlock {
  const descriptor = getBlockDescriptor(type);
  if (!descriptor) throw new Error(`Missing descriptor for ${type}`);
  return {
    id: `${type}-test`,
    type,
    props: structuredClone(descriptor.defaultProps),
  };
}

describe("dealership block renderers", () => {
  it.each(DEALERSHIP_BLOCK_TYPES)(
    "renders the validated %s defaults without throwing",
    async (type) => {
      const descriptor = getBlockDescriptor(type);
      const Component = getBlockComponent(type);
      if (!descriptor || !Component) throw new Error(`Unregistered block: ${type}`);

      render(<Component block={defaultBlock(type)} mode="standard" />);

      if (type === "announcement-bar") {
        expect(screen.getByText(String(descriptor.defaultProps.message)))
          .toBeInTheDocument();
      } else {
        expect(
          screen.getByRole("heading", {
            name: String(descriptor.defaultProps.title),
          }),
        ).toBeInTheDocument();
      }

      if (type === "featured-vehicles" || type === "new-arrivals") {
        expect(await screen.findByRole("heading", { name: "Porsche 911" }))
          .toBeInTheDocument();
      }
    },
  );

  it("queries recommended and recently-added inventory independently", async () => {
    const Featured = getBlockComponent("featured-vehicles");
    const Arrivals = getBlockComponent("new-arrivals");
    if (!Featured || !Arrivals) throw new Error("Vehicle blocks are unregistered");

    render(
      <>
        <Featured block={defaultBlock("featured-vehicles")} mode="standard" />
        <Arrivals block={defaultBlock("new-arrivals")} mode="standard" />
      </>,
    );
    await waitFor(() => expect(mocks.loadVehicleResults).toHaveBeenCalledTimes(2));
    expect(mocks.loadVehicleResults.mock.calls.map((call) => call[1]))
      .toEqual(expect.arrayContaining(["recommended", "created_desc"]));
  });

  it("keeps successfully loaded curated vehicles when one lookup fails", async () => {
    const Featured = getBlockComponent("featured-vehicles");
    if (!Featured) throw new Error("Featured vehicles is unregistered");
    const block = defaultBlock("featured-vehicles");
    block.props = {
      ...block.props,
      vehicleIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
    };
    mocks.loadVehicleById
      .mockRejectedValueOnce(new Error("Vehicle unavailable"))
      .mockResolvedValueOnce({ vehicle, images: [] });

    render(<Featured block={block} mode="standard" />);

    expect(await screen.findByRole("heading", { name: "Porsche 911" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("supports keyboard carousel navigation and reduced-motion scrolling", async () => {
    motionState.reduced = true;
    const Featured = getBlockComponent("featured-vehicles");
    if (!Featured) throw new Error("Featured vehicles is unregistered");
    render(<Featured block={defaultBlock("featured-vehicles")} mode="standard" />);
    const carousel = await screen.findByRole("region", {
      name: "Featured vehicles",
    });
    fireEvent.keyDown(carousel, { key: "ArrowRight" });
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({
      behavior: "auto",
    }));
  });

  it("opens and closes FAQ answers through the accessible accordion trigger", () => {
    render(<FaqAccordion block={defaultBlock("faq-accordion")} mode="standard" />);
    const trigger = screen.getByRole("button", {
      name: "Can you source a vehicle that is not listed?",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText(/begin a discreet search/i),
    ).toBeInTheDocument();
  });

  it("builds a make, model, and budget inventory destination", async () => {
    const SearchBand = getBlockComponent("vehicle-search-band");
    if (!SearchBand) throw new Error("Vehicle search band is unregistered");
    render(<SearchBand block={defaultBlock("vehicle-search-band")} mode="standard" />);

    await screen.findByRole("option", { name: "Porsche" });
    fireEvent.change(screen.getByRole("combobox", { name: "Make" }), {
      target: { value: "Porsche" },
    });
    await waitFor(() => expect(mocks.loadVehicleFacets).toHaveBeenLastCalledWith(
      "Porsche",
      "",
    ));
    await screen.findByRole("option", { name: "911" });
    fireEvent.change(screen.getByRole("combobox", { name: "Model" }), {
      target: { value: "911" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum budget" }), {
      target: { value: "50000" },
    });

    expect(screen.getByRole("link", { name: /search inventory/i })).toHaveAttribute(
      "href",
      "/vehicles#vehicles?make=Porsche&model=911&priceMax=50000",
    );
  });

  it("exposes stable accessible labels for animated trust content", () => {
    const Stats = getBlockComponent("trust-stats");
    const Logos = getBlockComponent("logo-marquee");
    if (!Stats || !Logos) throw new Error("Trust blocks are unregistered");
    render(
      <>
        <Stats block={defaultBlock("trust-stats")} mode="standard" />
        <Logos block={defaultBlock("logo-marquee")} mode="standard" />
      </>,
    );

    expect(screen.getByLabelText("2,500+")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Dealership partners" }))
      .toBeInTheDocument();
  });
});

describe("dealership conversion forms", () => {
  it("prevents repeated submission while a lead request is in flight", async () => {
    let resolveLead: ((value: { leadId: string }) => void) | undefined;
    mocks.submitLead.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveLead = resolve;
      }),
    );
    render(
      <NewsletterSignup
        block={defaultBlock("newsletter-signup")}
        mode="standard"
      />,
    );
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "visitor@example.com" },
    });
    const form = screen.getByRole("button", { name: /notify me/i }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mocks.submitLead).toHaveBeenCalledOnce();
    resolveLead?.({ leadId: "lead-one" });
    await screen.findByText(/new-arrival list/i);
  });

  it("does not submit without a return email address or phone number", async () => {
    render(
      <LeadCaptureForm
        block={defaultBlock("lead-capture-form")}
        mode="standard"
      />,
    );
    fireEvent.submit(
      screen.getByRole("button", { name: /send enquiry/i }).closest("form")!,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /add an email address or phone number/i,
    );
    expect(mocks.submitLead).not.toHaveBeenCalled();
  });

  it("submits trade-in details through the attributed lead pipeline", async () => {
    render(<TradeInForm block={defaultBlock("trade-in-form")} mode="standard" />);
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2020" } });
    fireEvent.change(screen.getByLabelText("Make"), { target: { value: "BMW" } });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "X3" } });
    fireEvent.change(screen.getByLabelText("Mileage"), { target: { value: "45000" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "visitor@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /request appraisal/i }).closest("form")!);

    await waitFor(() => expect(mocks.submitLead).toHaveBeenCalledOnce());
    expect(mocks.submitLead).toHaveBeenCalledWith(expect.objectContaining({
      email: "visitor@example.com",
      source: "contact-form",
      message: expect.stringContaining("[Trade-in appraisal]"),
    }));
    expect(await screen.findByText(/appraisal request is with our team/i))
      .toBeInTheDocument();
  });

  it("submits test-drive requests with the dedicated source", async () => {
    render(
      <TestDriveBooking
        block={defaultBlock("test-drive-booking")}
        mode="standard"
      />,
    );
    fireEvent.change(screen.getByLabelText("Vehicle of interest"), {
      target: { value: "2024 Porsche 911" },
    });
    fireEvent.change(screen.getByLabelText("Preferred date"), {
      target: { value: "2026-08-15" },
    });
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "+1 555 123 4567" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /request test drive/i }).closest("form")!);

    await waitFor(() => expect(mocks.submitLead).toHaveBeenCalledOnce());
    expect(mocks.submitLead).toHaveBeenCalledWith(expect.objectContaining({
      phone: "+1 555 123 4567",
      source: "test-drive",
      message: expect.stringContaining("[Test-drive request]"),
    }));
  });

  it("submits general enquiries through the contact source", async () => {
    render(
      <LeadCaptureForm
        block={defaultBlock("lead-capture-form")}
        mode="standard"
      />,
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "visitor@example.com" },
    });
    fireEvent.change(screen.getByLabelText("How can we help?"), {
      target: { value: "I am looking for a grand tourer." },
    });
    fireEvent.submit(screen.getByRole("button", { name: /send enquiry/i }).closest("form")!);

    await waitFor(() => expect(mocks.submitLead).toHaveBeenCalledOnce());
    expect(mocks.submitLead).toHaveBeenCalledWith(expect.objectContaining({
      email: "visitor@example.com",
      message: "I am looking for a grand tourer.",
      source: "contact-form",
    }));
  });

  it("submits new-arrival signups through the same existing pipeline", async () => {
    render(
      <NewsletterSignup
        block={defaultBlock("newsletter-signup")}
        mode="standard"
      />,
    );
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "visitor@example.com" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /notify me/i }).closest("form")!);

    await waitFor(() => expect(mocks.submitLead).toHaveBeenCalledOnce());
    expect(mocks.submitLead).toHaveBeenCalledWith({
      email: "visitor@example.com",
      message: "[New-arrival notification request]",
      source: "contact-form",
    });
  });
});

describe("registry motion primitives", () => {
  it("renders one static marquee row when reduced motion is requested", () => {
    motionState.reduced = true;
    const { container } = render(
      <Marquee repeat={4}>
        <span>Partner</span>
      </Marquee>,
    );
    const rows = container.querySelectorAll('[data-slot="marquee-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveClass("animate-marquee");
  });

  it("renders the final statistic immediately when reduced motion is requested", () => {
    motionState.reduced = true;
    render(<NumberTicker value={2500} />);
    expect(screen.getByText("2,500")).toBeInTheDocument();
    expect(screen.getByLabelText("2,500")).toBeInTheDocument();
  });
});
