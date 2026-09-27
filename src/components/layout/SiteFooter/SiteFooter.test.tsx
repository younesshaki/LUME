import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  slug: "demo",
  footer: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@/lib/publicTenant", () => ({
  get publicTenantSlug() {
    return state.slug;
  },
  resolvePublicTenant: async () => ({ id: "t1", slug: state.slug, name: "Luxury Motors" }),
}));
vi.mock("@/lib/TenantThemeProvider", () => ({
  useTenantTheme: () => ({ footer: state.footer, branding: {} }),
}));
vi.mock("../siteNavigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../siteNavigation")>();
  return {
    ...actual,
    useSiteNavItems: () => [
      { label: "Home", screen: "home", icon: null },
      { label: "Vehicles", screen: "vehicles", icon: null },
      { label: "Trade-In", screen: "trade-in", icon: null },
    ],
  };
});
vi.mock("@/app-shell/routeModules", () => ({ preloadRouteModule: () => undefined }));

import { SiteFooter } from "./SiteFooter";

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderFooter(onNavigate = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/home"]}>
      <Routes>
        <Route path="*" element={<><SiteFooter onNavigate={onNavigate} /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
  return onNavigate;
}

beforeEach(() => {
  state.slug = "demo";
  state.footer = { columns: 3, variant: "stacked", showSocial: true };
});

describe("SiteFooter for a dealership", () => {
  it("shows the dealer's own pages and name, and none of LUME's house copy", async () => {
    renderFooter();
    const nav = screen.getByRole("navigation", { name: "Footer navigation" });
    expect(nav).toHaveTextContent("Trade-In");
    await waitFor(() => expect(screen.getByText(/© \d{4} Luxury Motors\./)).toBeInTheDocument());
    expect(screen.queryByText(/hotel you cannot book/i)).toBeNull();
    expect(screen.queryByText(/Monaco/i)).toBeNull();
    // showSocial with nothing configured renders no fake social links.
    expect(screen.queryByRole("link", { name: /instagram|youtube|twitter/i })).toBeNull();
  });

  it("routes custom pages directly and built-in screens through the page's handler", async () => {
    const onNavigate = renderFooter();
    await userEvent.click(screen.getByRole("button", { name: "Trade-In" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/trade-in");
    await userEvent.click(screen.getByRole("button", { name: "Vehicles" }));
    expect(onNavigate).toHaveBeenCalledWith("vehicles");
  });
});

describe("SiteFooter minimal variant", () => {
  it("drops the nav row but keeps the tenant's social links", () => {
    state.footer = {
      variant: "minimal",
      showSocial: true,
      socialLinks: [{ label: "Instagram", href: "https://instagram.com/luxurymotors" }],
    };
    renderFooter();
    expect(screen.queryByRole("navigation", { name: "Footer navigation" })).toBeNull();
    expect(screen.getByRole("link", { name: "Instagram" })).toHaveAttribute(
      "href",
      "https://instagram.com/luxurymotors",
    );
  });
});

describe("SiteFooter for the LUME house site", () => {
  it("keeps the historical copy and default social links", async () => {
    state.slug = "default";
    state.footer = undefined;
    renderFooter();
    expect(screen.getByText(/hotel you cannot book/i)).toBeInTheDocument();
    expect(screen.getByText(/Monaco/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Instagram" })).toBeInTheDocument();
    expect(screen.getByText(/© \d{4} LUME\./)).toBeInTheDocument();
  });
});
