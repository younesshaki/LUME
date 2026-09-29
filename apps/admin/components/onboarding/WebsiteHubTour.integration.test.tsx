import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { recordWebsiteTourOutcome } from "../../app/admin/[tenant]/website/actions";
import { WebsiteHubTour } from "./WebsiteHubTour";
import { WEBSITE_TOUR_TARGETS } from "../../lib/websiteTour";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/demo-sean/website",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../../app/admin/[tenant]/website/actions", () => ({
  recordWebsiteTourOutcome: vi.fn(async () => ({})),
}));

class ResizeObserverStub {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("scrollTo", vi.fn());
  HTMLElement.prototype.scrollIntoView = vi.fn();
  for (const selector of Object.values(WEBSITE_TOUR_TARGETS)) {
    const target = document.createElement("div");
    target.setAttribute("data-tour", selector.match(/"([^\"]+)"/)?.[1] ?? "missing");
    document.body.append(target);
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  document.body.replaceChildren();
});

describe("WebsiteHubTour with NextStep", () => {
  it("mounts an interactive overlay with a keyboard-operable card", async () => {
    render(<WebsiteHubTour tenantSlug="demo-sean" startMode="automatic" />);

    const dialog = await screen.findByRole("dialog", { name: "Website tour" });
    expect(dialog.textContent).toContain("Your dealership website");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(document.querySelector('[data-name="nextstep-prevent-click-overlay"]')).toBeNull();
      expect(document.querySelector('[data-name="nextstep-pointer"]')).not.toBeNull();
    });
    expect((document.querySelector('[data-name="nextstep-pointer"]') as HTMLElement).style.pointerEvents)
      .toBe("none");
  });

  it("offers \"Don't show again\", which closes the tour and saves the opt-out only", async () => {
    vi.mocked(recordWebsiteTourOutcome).mockClear();
    render(<WebsiteHubTour tenantSlug="demo-sean" startMode="automatic" dismissible />);

    await screen.findByRole("dialog", { name: "Website tour" });
    fireEvent.click(screen.getByRole("button", { name: "Don’t show again" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Website tour" })).toBeNull());
    expect(recordWebsiteTourOutcome).toHaveBeenCalledTimes(1);
    expect(recordWebsiteTourOutcome).toHaveBeenCalledWith("demo-sean", "dismissed");
  });

  it("hides \"Don't show again\" when the tour does not open by itself", async () => {
    render(<WebsiteHubTour tenantSlug="default" startMode="manual" />);
    await screen.findByRole("dialog", { name: "Website tour" });
    expect(screen.queryByRole("button", { name: "Don’t show again" })).toBeNull();
  });
});
