import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import WebsiteClient from "./WebsiteClient";
import { WEBSITE_TOUR_TARGETS } from "../../../../lib/websiteTour";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="website-tour-loader" />,
}));

vi.mock("../../../../components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange, ...props }: {
    checked: boolean;
    onCheckedChange: (value: boolean) => void;
  } & React.ComponentProps<"button">) => (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onCheckedChange(!checked)} {...props} />
  ),
}));

vi.mock("./LaunchReadinessSection", () => ({
  default: () => <section aria-label="Launch readiness report" />,
}));

vi.mock("./actions", () => ({
  setSiteNavLoaderEnabled: vi.fn(async () => ({})),
}));

afterEach(cleanup);

function renderWebsite(overrides: Partial<React.ComponentProps<typeof WebsiteClient>> = {}) {
  return render(
    <WebsiteClient
      tenantSlug="demo-sean"
      tenantName="Sean Auto Group"
      publicSiteBaseUrl="https://example.com"
      pages={[]}
      navLoaderEnabled
      pilotReport={null}
      publicReport={null}
      launchLoadError={false}
      websiteTourStart="none"
      websiteTourEnabled
      {...overrides}
    />,
  );
}

describe("Website Hub tour targets", () => {
  it("attaches stable targets to the intended Hub controls and excludes the immediate live switch", () => {
    const { container } = renderWebsite();
    for (const selector of Object.values(WEBSITE_TOUR_TARGETS)) {
      expect(container.querySelector(selector)).not.toBeNull();
    }
    expect(screen.getByRole("switch", { name: "Loading animation" }).getAttribute("data-tour")).toBeNull();
  });

  it("shows the replay entry point only for the enabled rollout cohort", () => {
    const { rerender } = renderWebsite();
    expect(screen.getByRole("link", { name: "Take Website tour" }).getAttribute("href"))
      .toBe("/admin/demo-sean/website?tour=website");

    rerender(
      <WebsiteClient
        tenantSlug="default"
        tenantName="Default Motors"
        publicSiteBaseUrl="https://example.com"
        pages={[]}
        navLoaderEnabled
        pilotReport={null}
        publicReport={null}
        launchLoadError={false}
        websiteTourStart="none"
        websiteTourEnabled={false}
      />,
    );
    expect(screen.queryByRole("link", { name: "Take Website tour" })).toBeNull();
  });
});
