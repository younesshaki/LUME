import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const cookie = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@/components/CookieBanner/CookieBanner", () => ({ openCookiePreferences: cookie.open }));
vi.mock("@/app-shell/routeModules", () => ({ preloadRouteModule: () => undefined }));

import { SiteFooterGlo3D } from "./SiteFooterGlo3D";
import { footerContent } from "./footerContent";

const NAV = [
  { label: "Home", screen: "home", icon: null },
  { label: "Inventory", screen: "vehicles", icon: null },
  { label: "Trade-In", screen: "trade-in", icon: null },
];

function renderFooter(variant: "columns" | "stacked" | "minimal" = "columns") {
  const onNavigate = vi.fn();
  const content = footerContent({ tenantSlug: "demo-sean", tenantName: "Sean Auto Group", footer: { variant } });
  render(
    <SiteFooterGlo3D
      content={content}
      logoImage="https://cdn.example/logo.png"
      tenantName="Sean Auto Group"
      navItems={NAV}
      socialLinks={[{ label: "Instagram", href: "https://instagram.com/sean", icon: null }]}
      legalLinks={content.legalLinks}
      onNavigate={onNavigate}
    />,
  );
  return onNavigate;
}

describe("Template Glo3D footer", () => {
  it("shows the dealership's name, logo, pages, social and legal links", () => {
    renderFooter();
    expect(screen.getByAltText("Sean Auto Group logo")).toBeTruthy();
    expect(screen.getByText(/© \d{4} Sean Auto Group\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Instagram" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacy" })).toBeTruthy();
  });

  it("navigates to pages and opens cookie preferences", () => {
    const onNavigate = renderFooter();
    fireEvent.click(screen.getByRole("button", { name: "Trade-In" }));
    expect(onNavigate).toHaveBeenCalledWith("trade-in");
    fireEvent.click(screen.getByRole("button", { name: "Cookie preferences" }));
    expect(cookie.open).toHaveBeenCalled();
  });

  it("drops the photo panel if the photo fails to load", () => {
    const { container } = { container: document.body };
    renderFooter();
    const photo = container.querySelector(".glo3dFooter__photo img") as HTMLImageElement;
    expect(photo).toBeTruthy();
    fireEvent.error(photo);
    expect(container.querySelector(".glo3dFooter__photo")).toBeNull();
    expect(container.querySelector(".glo3dFooter--noPhoto")).toBeTruthy();
  });

  it("minimal keeps only social and the legal bar", () => {
    renderFooter("minimal");
    expect(screen.queryByRole("navigation", { name: "Footer navigation" })).toBeNull();
    expect(document.querySelector(".glo3dFooter__photo")).toBeNull();
    expect(screen.getByRole("button", { name: "Cookie preferences" })).toBeTruthy();
  });
});
