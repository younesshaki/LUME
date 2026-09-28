import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  it("mounts the real modal overlay with a keyboard-operable card and click blocking", async () => {
    render(<WebsiteHubTour tenantSlug="demo-sean" startMode="automatic" />);

    const dialog = await screen.findByRole("dialog", { name: "Website tour" });
    expect(dialog.textContent).toContain("Your dealership website");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(document.querySelector('[data-name="nextstep-prevent-click-overlay"]')).not.toBeNull();
      expect(document.querySelector('[data-name="nextstep-pointer"]')).not.toBeNull();
    });
    expect((document.querySelector('[data-name="nextstep-pointer"]') as HTMLElement).style.pointerEvents)
      .toBe("auto");
  });
});
