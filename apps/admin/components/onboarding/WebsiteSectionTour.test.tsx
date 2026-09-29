/** @vitest-environment jsdom */
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WebsiteSectionTour } from "./WebsiteSectionTour";
import { WEBSITE_SECTION_TOURS } from "../../lib/websiteSectionTour";

const mocks = vi.hoisted(() => ({
  closeNextStep: vi.fn(),
  dismissWebsiteSectionTour: vi.fn(async () => ({})),
  startNextStep: vi.fn(),
}));

vi.mock("nextstepjs", () => ({
  NextStepProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  NextStep: ({ children, steps, cardComponent: Card }: {
    children: React.ReactNode;
    steps: Array<{ steps: Array<Record<string, unknown>> }>;
    cardComponent: React.ComponentType<Record<string, unknown>>;
  }) => (
    <div>
      {children}
      {createElement(Card, {
        step: steps[0]?.steps[0],
        currentStep: 0,
        totalSteps: steps[0]?.steps.length ?? 0,
        nextStep: vi.fn(),
        prevStep: vi.fn(),
        skipTour: vi.fn(),
      })}
    </div>
  ),
  useNextStep: () => ({
    startNextStep: mocks.startNextStep,
    closeNextStep: mocks.closeNextStep,
  }),
}));

vi.mock("../ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => <button {...props}>{children}</button>,
}));

vi.mock("../../app/admin/[tenant]/website/actions", () => ({
  dismissWebsiteSectionTour: mocks.dismissWebsiteSectionTour,
}));

function mountTargets(key: keyof typeof WEBSITE_SECTION_TOURS) {
  for (const { selector } of WEBSITE_SECTION_TOURS[key].steps) {
    const target = document.createElement("div");
    target.setAttribute("data-tour", selector.match(/"([^"]+)"/)?.[1] ?? "missing");
    document.body.append(target);
  }
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  window.history.replaceState(null, "", "/admin/demo-sean/pages");
  mocks.startNextStep.mockReset();
  mocks.closeNextStep.mockReset();
  mocks.dismissWebsiteSectionTour.mockClear();
});

describe("WebsiteSectionTour", () => {
  it("waits for every target before starting a route-local tutorial", async () => {
    render(<WebsiteSectionTour tenantSlug="demo-sean" tourKey="pages" startMode="automatic" dismissible />);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(mocks.startNextStep).not.toHaveBeenCalled();

    cleanup();
    mountTargets("pages");
    render(<WebsiteSectionTour tenantSlug="demo-sean" tourKey="pages" startMode="automatic" dismissible />);
    await waitFor(() => expect(mocks.startNextStep).toHaveBeenCalledWith("website-pages-v1"));
  });

  it("clears only its own replay query after a manual start", async () => {
    mountTargets("design");
    window.history.replaceState(null, "", "/admin/demo-sean/design?template=glo3d&tour=design");
    render(<WebsiteSectionTour tenantSlug="demo-sean" tourKey="design" startMode="manual" dismissible={false} />);
    await waitFor(() => expect(mocks.startNextStep).toHaveBeenCalledWith("website-design-v1"));
    expect(window.location.search).toBe("?template=glo3d");
  });

  it("persists only an explicit route opt-out and leaves manual runs without that control", async () => {
    render(<WebsiteSectionTour tenantSlug="demo-max" tourKey="navigation" startMode="none" dismissible />);
    fireEvent.click(screen.getByRole("button", { name: "Don’t show again" }));
    await waitFor(() => expect(mocks.dismissWebsiteSectionTour).toHaveBeenCalledWith("demo-max", "navigation"));
    expect(mocks.closeNextStep).toHaveBeenCalledTimes(1);

    cleanup();
    render(<WebsiteSectionTour tenantSlug="default" tourKey="navigation" startMode="manual" dismissible={false} />);
    expect(screen.queryByRole("button", { name: "Don’t show again" })).toBeNull();
  });
});
