/** @vitest-environment jsdom */
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listEditorBlockDescriptors } from "@lume/blocks";
import type { Page } from "@lume/types";
import PagesListClient from "./pages/PagesListClient";
import PageEditorClient from "./pages/[pageId]/PageEditorClient";
import WebsiteClient from "./website/WebsiteClient";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({}),
}));

vi.mock("./pages/VehicleLayoutPanel", () => ({
  VehicleLayoutPanel: () => createElement("section", null, "Vehicle layout"),
}));

vi.mock("@/components/ui/carousel", () => ({
  default: () => createElement("div", null, "Carousel"),
}));

vi.mock("@/components/confirm-action-dialog", () => ({
  ConfirmActionDialog: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
}));

vi.mock("./pages/[pageId]/LivePreviewPanel", () => ({
  LivePreviewPanel: () => createElement("div", null, "Preview"),
}));

vi.mock("./pages/[pageId]/VariantCarousel", () => ({
  VariantCarousel: () => createElement("div", null, "Variants"),
}));

vi.mock("./pages/[pageId]/ConciergePanel", () => ({
  ConciergePanel: () => null,
}));

vi.mock("@/components/asset-picker", () => ({ AssetPicker: () => null }));

vi.mock("./website/LaunchReadinessSection", () => ({
  default: () => createElement("section", null, "Launch readiness"),
}));

const PAGE: Page = {
  id: "page-1",
  tenantId: "tenant-1",
  slug: "home",
  title: "Home",
  navOrder: 0,
  isReserved: false,
  archivedAt: null,
  draftRevisionId: "draft-1",
  publishedRevisionId: "published-1",
  seoMeta: {},
  createdAt: "2026-09-26T00:00:00.000Z",
  updatedAt: "2026-09-26T00:00:00.000Z",
};

describe("admin website-builder surfaces", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
    cleanup();
  });

  it("mounts the Pages list without console errors", () => {
    render(createElement(PagesListClient, {
      tenantId: "tenant-1",
      tenantSlug: "sandbox",
      initialPages: [PAGE],
      initialHeader: {},
      publicSiteBaseUrl: "https://public.example.test",
      sampleVehicle: null,
    }));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("mounts the page editor without console errors", () => {
    render(createElement(PageEditorClient, {
      tenantId: "tenant-1",
      tenantSlug: "sandbox",
      publicSiteBaseUrl: "https://public.example.test",
      page: {
        id: "page-1",
        slug: "home",
        title: "Home",
        draftRevisionId: "draft-1",
        publishedRevisionId: "published-1",
      },
      initialBlocks: { version: 1, blocks: [] },
      initialRevisions: [],
      blockDescriptors: listEditorBlockDescriptors(),
      premiumModelsEnabled: false,
      providerAvailability: {} as never,
    }));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("mounts Website settings without console errors", () => {
    render(createElement(WebsiteClient, {
      tenantSlug: "sandbox",
      tenantName: "Sandbox Motors",
      publicSiteBaseUrl: "https://public.example.test",
      pages: [PAGE],
      navLoaderEnabled: true,
      pilotReport: null,
      publicReport: null,
      launchLoadError: false,
      websiteTourStart: "none",
      websiteTourEnabled: false,
    }));
    expect(consoleError).not.toHaveBeenCalled();
  });
});
