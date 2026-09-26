/** @vitest-environment jsdom */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VehicleLayoutPanel } from "./VehicleLayoutPanel";

const mocks = vi.hoisted(() => ({
  createPage: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@lume/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lume/db")>()),
  createPage: mocks.createPage,
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({}),
}));

function renderPanel(overrides: Partial<Parameters<typeof VehicleLayoutPanel>[0]> = {}) {
  return render(createElement(VehicleLayoutPanel, {
    tenantSlug: "sandbox",
    tenantId: "tenant-1",
    existingPageId: null,
    isPublished: false,
    publicSiteBaseUrl: "https://public.example.test",
    sampleVehicle: { id: "vehicle-1", label: "2026 Toyota Camry XSE" },
    ...overrides,
  }));
}

describe("VehicleLayoutPanel lifecycle", () => {
  beforeEach(() => {
    mocks.createPage.mockReset();
    mocks.push.mockReset();
    mocks.createPage.mockResolvedValue({ id: "vehicle-page" });
  });

  afterEach(cleanup);

  it("explains the built-in fallback and creates a reversible vehicle-layout draft", async () => {
    renderPanel();

    expect(screen.getByText(/use LUME's built-in layout until you create and publish a draft/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create vehicle layout draft" }));

    await waitFor(() => expect(mocks.createPage).toHaveBeenCalledTimes(1));
    expect(mocks.createPage.mock.calls[0]?.[1]).toMatchObject({
      tenantId: "tenant-1",
      slug: "vehicle",
    });
    expect(mocks.push).toHaveBeenCalledWith("/admin/sandbox/pages/vehicle-page");
  });

  it("shows a draft-only layout as safe to edit and previews it with real inventory", () => {
    renderPanel({ existingPageId: "vehicle-page" });

    expect(screen.getByText(/visitors still see LUME's built-in layout until you publish/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit layout" }).getAttribute("href"))
      .toBe("/admin/sandbox/pages/vehicle-page");
    expect(screen.getByRole("link", { name: /Preview with sample vehicle: 2026 Toyota Camry XSE/i }).getAttribute("href"))
      .toBe("https://public.example.test/vehicles/vehicle-1?tenant=sandbox");
  });

  it("makes a published layout's scope and unpublish recovery explicit", () => {
    renderPanel({ existingPageId: "vehicle-page", isPublished: true, sampleVehicle: null });

    expect(screen.getByText(/every vehicle currently uses this layout/i)).toBeTruthy();
    expect(screen.getByText(/unpublish it from the editor at any time to restore LUME's built-in layout/i)).toBeTruthy();
    expect(screen.getByText(/your draft remains saved and can be published again/i)).toBeTruthy();
    expect(screen.getByText(/Add a vehicle to inventory to preview this layout with actual vehicle data/i)).toBeTruthy();
  });
});
