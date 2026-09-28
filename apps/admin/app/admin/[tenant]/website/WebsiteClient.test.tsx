import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { cleanup, render, screen } from "@testing-library/react";
import WebsiteClient from "./WebsiteClient";
import { WEBSITE_TOUR_START_EVENT, WEBSITE_TOUR_TARGETS } from "../../../../lib/websiteTour";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

const push = vi.fn();
let pathname = "/admin/demo-sean/website";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
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

  it("restarts the tutorial in place from the Hub, for any tenant", () => {
    const started = vi.fn();
    window.addEventListener(WEBSITE_TOUR_START_EVENT, started);
    pathname = "/admin/default/website";
    renderWebsite({ tenantSlug: "default", tenantName: "Default Motors" });
    fireEvent.click(screen.getByRole("button", { name: "Start the Website tutorial" }));
    fireEvent.click(screen.getByRole("button", { name: "Start the Website tutorial" }));
    expect(started).toHaveBeenCalledTimes(2);
    expect(push).not.toHaveBeenCalled();
    window.removeEventListener(WEBSITE_TOUR_START_EVENT, started);
  });
});
