/** @vitest-environment jsdom */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantTheme } from "@lume/types";
import NavigationClient from "./NavigationClient";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    from: () => ({ update: mocks.update }),
  }),
}));

const NAV_PAGES = [
  { slug: "home", title: "Home", navOrder: 0 },
  { slug: "inventory", title: "Inventory", navOrder: 1 },
];

function renderNavigation(initialTheme: TenantTheme = {}) {
  return render(createElement(NavigationClient, {
    tenantId: "tenant-1",
    tenantSlug: "sandbox",
    tenantName: "Sandbox Motors",
    initialTheme,
    navPages: NAV_PAGES,
  }));
}

function preview() {
  const element = screen.getByTestId("navigation-live-preview");
  if (!(element instanceof HTMLElement)) throw new Error("Navigation preview missing");
  return element;
}

describe("NavigationClient live header and footer preview", () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    mocks.update.mockReset();
    mocks.eq.mockReset();
    mocks.eq.mockResolvedValue({ error: null });
    mocks.update.mockReturnValue({ eq: mocks.eq });
  });

  afterEach(cleanup);

  it.each([
    ["Centred", "centred"],
    ["Left aligned", "left"],
    ["Split", "split"],
    ["Minimal", "minimal"],
  ] as const)("updates the preview immediately for the %s header variant", (label, variant) => {
    renderNavigation();
    fireEvent.click(screen.getAllByRole("button", { name: label })[0]!);
    expect(preview().dataset.headerVariant).toBe(variant);
  });

  it.each([
    ["Stacked", "stacked"],
    ["Columns", "columns"],
    ["Minimal", "minimal"],
  ] as const)("updates the preview immediately for the %s footer variant", (label, variant) => {
    renderNavigation();
    fireEvent.click(screen.getAllByRole("button", { name: label }).at(-1)!);
    expect(preview().dataset.footerVariant).toBe(variant);
  });

  it("persists logo placement, CTA, and footer columns, then restores them on reload", async () => {
    const { unmount } = renderNavigation();

    fireEvent.click(screen.getByRole("button", { name: "Centre" }));
    fireEvent.change(screen.getByLabelText("Call-to-action label"), {
      target: { value: "Book a test drive" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Columns" }).at(-1)!);
    fireEvent.change(screen.getByLabelText("Footer columns"), { target: { value: "4" } });

    expect(preview().dataset.logoPlacement).toBe("centre");
    expect(preview().textContent).toContain("Book a test drive");
    expect(preview().querySelector("footer > div")?.getAttribute("style")).toContain("repeat(4");

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.eq).toHaveBeenCalledWith("id", "tenant-1"));

    const savedTheme = mocks.update.mock.calls[0]?.[0]?.theme as TenantTheme;
    expect(savedTheme.header).toMatchObject({
      logoPlacement: "centre",
      ctaLabel: "Book a test drive",
    });
    expect(savedTheme.footer).toMatchObject({ variant: "columns", columns: 4 });

    unmount();
    renderNavigation(savedTheme);
    expect(preview().dataset.logoPlacement).toBe("centre");
    expect(preview().dataset.footerVariant).toBe("columns");
    expect(preview().textContent).toContain("Book a test drive");
  });
});
