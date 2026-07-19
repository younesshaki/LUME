import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  createDefaultSiteDesign,
  getSiteTemplate,
  type SiteDesign,
} from "@lume/types";
import { TemplateConversionPanel } from "./TemplateConversionPanel";

const mocks = vi.hoisted(() => ({
  design: null as SiteDesign | null,
  navigateTo: vi.fn(),
  submitLead: vi.fn(),
}));

vi.mock("@/lib/TenantThemeProvider", () => ({
  useTenantSiteDesign: () => mocks.design,
}));

vi.mock("@/app-shell/NavigationProvider", () => ({
  useNavigation: () => ({
    currentPath: "/home",
    navigateTo: mocks.navigateTo,
  }),
}));

vi.mock("@/lib/leads", () => ({
  submitLead: mocks.submitLead,
}));

vi.mock("@/components/ui/blur-fade", () => ({
  BlurFade: ({ children }: { children: ReactNode }) => children,
}));

describe("TemplateConversionPanel", () => {
  beforeEach(() => {
    mocks.design = createDefaultSiteDesign(getSiteTemplate("capital"));
    mocks.navigateTo.mockReset();
    mocks.submitLead.mockReset().mockResolvedValue({ leadId: "lead-1" });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      }),
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.removeAttribute("open");
        this.dispatchEvent(new Event("close"));
      }),
    });
  });

  it("leaves the original Luxury home unchanged", () => {
    mocks.design = createDefaultSiteDesign(getSiteTemplate("luxury"));
    const { container } = render(<TemplateConversionPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("routes finite browse actions through the app navigation adapter", async () => {
    const user = userEvent.setup();
    render(<TemplateConversionPanel />);
    await user.click(screen.getByRole("button", { name: "Browse by vehicle" }));
    expect(mocks.navigateTo).toHaveBeenCalledWith(
      { route: "vehicles" },
      expect.objectContaining({
        analytics: { action: "template_capital_browse-inventory" },
      }),
    );
  });

  it("submits a real specialty lead with trusted intent context", async () => {
    const user = userEvent.setup();
    render(<TemplateConversionPanel />);
    await user.click(screen.getByRole("button", { name: "Explore financing" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("open");

    await user.type(screen.getByLabelText("Email"), "buyer@example.com");
    await user.type(
      screen.getByLabelText(/target vehicle, budget/i),
      "SUV near 600 per month",
    );
    await user.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() => {
      expect(mocks.submitLead).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "buyer@example.com",
          source: "contact-form",
          message: "[Website financing request]\nSUV near 600 per month",
        }),
      );
    });
    expect(await screen.findByText(/Request received/)).toBeVisible();
  });
});
