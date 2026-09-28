import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TutorialButton } from "./TutorialButton";
import { WEBSITE_TOUR_START_EVENT } from "../../lib/websiteTour";

const push = vi.fn();
let pathname = "/admin/demo-max/vehicles";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("TutorialButton", () => {
  it("opens the Website Hub with the tutorial from any other admin page", () => {
    pathname = "/admin/demo-max/vehicles";
    render(<TutorialButton tenantSlug="demo-max" />);
    fireEvent.click(screen.getByRole("button", { name: "Start the Website tutorial" }));
    expect(push).toHaveBeenCalledWith("/admin/demo-max/website?tour=website");
  });

  it("restarts the tutorial in place on the Website Hub", () => {
    pathname = "/admin/demo-max/website";
    const started = vi.fn();
    window.addEventListener(WEBSITE_TOUR_START_EVENT, started);
    render(<TutorialButton tenantSlug="demo-max" />);
    fireEvent.click(screen.getByRole("button", { name: "Start the Website tutorial" }));
    expect(started).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    window.removeEventListener(WEBSITE_TOUR_START_EVENT, started);
  });
});
