/** @vitest-environment jsdom */
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultSiteDesign, getSiteTemplate } from "@lume/types";
import TemplatesClient from "./TemplatesClient";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("./actions", () => ({
  prepareWebsiteTemplateDraftAction: vi.fn(),
}));

function renderTemplates(overrides: Partial<Parameters<typeof TemplatesClient>[0]> = {}) {
  return render(createElement(TemplatesClient, {
    tenantSlug: "demo",
    tenantName: "Demo Motors",
    publishedDesign: createDefaultSiteDesign(getSiteTemplate("concierge")),
    hasStoredTemplate: true,
    publishedAt: "2026-09-26T12:00:00.000Z",
    headerVariant: "centred",
    footerVariant: "stacked",
    liveSiteUrl: "https://example.test/?tenant=demo",
    initialDrafts: [],
    canManage: true,
    ...overrides,
  }));
}

describe("TemplatesClient current-template panel", () => {
  afterEach(cleanup);

  beforeEach(() => {
    push.mockReset();
  });

  it.each([
    ["default", "Concierge" as const, "centred" as const, "stacked" as const],
    ["demo", "Luxury" as const, "centred" as const, "stacked" as const],
  ])("shows %s's stored %s template first with its live chrome", (tenantSlug, templateName, headerVariant, footerVariant) => {
    const templateKey = templateName.toLowerCase();
    renderTemplates({
      tenantSlug,
      publishedDesign: createDefaultSiteDesign(getSiteTemplate(templateKey)),
      headerVariant,
      footerVariant,
    });

    expect(screen.getByRole("heading", { name: `Your current template: ${templateName}` })).toBeTruthy();
    expect(screen.getByText("Version 1")).toBeTruthy();
    expect(screen.getByText(headerVariant)).toBeTruthy();
    expect(screen.getByText(footerVariant)).toBeTruthy();
    expect(document.querySelector("[data-template-card]")?.getAttribute("data-template-card")).toBe(templateKey);
    expect(within(document.querySelector(`[data-template-card="${templateKey}"]`)!).getByText("Current")).toBeTruthy();
  });

  it("does not present the visual fallback as a template the tenant selected", () => {
    renderTemplates({ tenantSlug: "secondplace", hasStoredTemplate: false, publishedAt: null });

    expect(screen.getByRole("heading", { name: "No template applied yet" })).toBeTruthy();
    expect(screen.getByText(/Your site uses the built-in default/i)).toBeTruthy();
    expect(screen.queryByText("Current")).toBeNull();
  });

  it("keeps a different saved draft visibly distinct from the current template", () => {
    renderTemplates({
      initialDrafts: [{
        templateKey: "capital",
        design: createDefaultSiteDesign(getSiteTemplate("capital")),
        updatedAt: "2026-09-26T13:00:00.000Z",
      }],
    });

    const capitalCard = document.querySelector('[data-template-card="capital"]');
    if (!(capitalCard instanceof HTMLElement)) throw new Error("Capital template card did not render");
    expect(within(capitalCard).getByText("Draft in progress")).toBeTruthy();
    expect(within(capitalCard).queryByText("Current")).toBeNull();
    expect(screen.getByRole("button", { name: /Continue Capital draft/i })).toBeTruthy();
  });
});
