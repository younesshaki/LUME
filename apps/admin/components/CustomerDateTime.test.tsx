import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CustomerDateTime, formatCustomerDateTime, normalizedDateTime } from "./CustomerDateTime";

describe("CustomerDateTime", () => {
  it("formats a date with hour and minute but without seconds", () => {
    const formatted = formatCustomerDateTime("2026-01-02T03:04:59.000Z", { locale: "en-US", timeZone: "UTC" });
    expect(formatted).toContain("Jan 2, 2026");
    expect(formatted).toMatch(/3:04\s*AM/i);
    expect(formatted).not.toContain("59");
  });

  it("renders semantic ISO time markup", () => {
    render(<CustomerDateTime value="2026-01-02T03:04:59.000Z" />);
    const time = screen.getByText(/2026/).closest("time");
    expect(time?.getAttribute("datetime")).toBe("2026-01-02T03:04:59.000Z");
    expect(time?.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it("keeps malformed legacy values readable and semantic", () => {
    expect(formatCustomerDateTime("unknown")).toBe("unknown");
    expect(normalizedDateTime("unknown")).toBe("unknown");
  });
});
