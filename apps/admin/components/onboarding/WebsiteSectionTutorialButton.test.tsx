/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WebsiteSectionTutorialButton } from "./WebsiteSectionTutorialButton";

afterEach(cleanup);

describe("WebsiteSectionTutorialButton", () => {
  it("starts its own route-local tutorial instead of redirecting to the Website Hub", () => {
    render(<WebsiteSectionTutorialButton tenantSlug="demo-sean" tourKey="templates" />);
    expect(screen.getByRole("link", { name: "Start the templates tutorial" }).getAttribute("href"))
      .toBe("/admin/demo-sean/templates?tour=templates");
  });
});
