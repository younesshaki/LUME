import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WebsiteHubTour } from "./WebsiteHubTour";
import { WEBSITE_TOUR_NAME, WEBSITE_TOUR_TARGETS } from "../../lib/websiteTour";

const mocks = vi.hoisted(() => ({
  startNextStep: vi.fn(),
  recordWebsiteTourOutcome: vi.fn(async () => ({})),
}));

vi.mock("nextstepjs", () => ({
  NextStepProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  NextStep: ({
    children,
    onComplete,
    onSkip,
  }: {
    children: React.ReactNode;
    onComplete: (tourName: string) => void;
    onSkip: (step: number, tourName: string) => void;
  }) => (
    <div data-testid="nextstep">
      {children}
      <button type="button" onClick={() => onComplete(WEBSITE_TOUR_NAME)}>complete</button>
      <button type="button" onClick={() => onSkip(2, WEBSITE_TOUR_NAME)}>skip</button>
    </div>
  ),
  useNextStep: () => ({ startNextStep: mocks.startNextStep }),
}));

vi.mock("../ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => <button {...props}>{children}</button>,
}));

vi.mock("../../app/admin/[tenant]/website/actions", () => ({
  recordWebsiteTourOutcome: mocks.recordWebsiteTourOutcome,
}));

afterEach(() => {
  cleanup();
  mocks.startNextStep.mockReset();
  mocks.recordWebsiteTourOutcome.mockClear();
  document.body.replaceChildren();
  window.history.replaceState(null, "", "/admin/demo-sean/website");
});

function mountTargets() {
  for (const selector of Object.values(WEBSITE_TOUR_TARGETS)) {
    const target = document.createElement("div");
    target.setAttribute("data-tour", selector.match(/"([^\"]+)"/)?.[1] ?? "missing");
    document.body.append(target);
  }
}

describe("WebsiteHubTour", () => {
  it("starts only after the Hub targets exist", async () => {
    render(<WebsiteHubTour tenantSlug="demo-sean" startMode="automatic" />);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(mocks.startNextStep).not.toHaveBeenCalled();

    cleanup();
    mountTargets();
    render(<WebsiteHubTour tenantSlug="demo-sean" startMode="automatic" />);
    await waitFor(() => expect(mocks.startNextStep).toHaveBeenCalledWith(WEBSITE_TOUR_NAME));
  });

  it("clears the replay query once a manual tour starts", async () => {
    mountTargets();
    window.history.replaceState(null, "", "/admin/demo-sean/website?tour=website");
    render(<WebsiteHubTour tenantSlug="demo-sean" startMode="manual" />);

    await waitFor(() => expect(mocks.startNextStep).toHaveBeenCalledWith(WEBSITE_TOUR_NAME));
    expect(window.location.search).toBe("");
  });

  it("persists terminal completion and skip without keeping the overlay open", async () => {
    render(<WebsiteHubTour tenantSlug="demo-max" startMode="none" />);
    fireEvent.click(screen.getByRole("button", { name: "complete" }));
    await waitFor(() => expect(mocks.recordWebsiteTourOutcome).toHaveBeenCalledWith("demo-max", "completed"));

    fireEvent.click(screen.getByRole("button", { name: "skip" }));
    await waitFor(() => expect(mocks.recordWebsiteTourOutcome).toHaveBeenCalledWith("demo-max", "skipped"));
  });
});
