import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const design = vi.hoisted(() => ({ key: "glo3d" as string | null }));
vi.mock("./TenantThemeProvider", () => ({
  useTenantSiteDesign: () => (design.key ? { template: { key: design.key, version: 1 } } : null),
}));

import { DualModeProvider, useDualMode } from "./DualModeContext";
import { TemplateModeScope } from "./TemplateModeScope";

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
  });
});

function ModeProbe() {
  return <p>{useDualMode().mode}</p>;
}

function renderScope() {
  localStorage.setItem("lume.dualMode", "experience");
  render(
    <DualModeProvider>
      <TemplateModeScope>
        <ModeProbe />
      </TemplateModeScope>
    </DualModeProvider>,
  );
}

describe("TemplateModeScope", () => {
  it("pins Template Glo3D to the standard (flat) mode", () => {
    design.key = "glo3d";
    renderScope();
    expect(screen.getByText("standard")).toBeTruthy();
    // The visitor's saved preference for other sites is untouched.
    expect(localStorage.getItem("lume.dualMode")).toBe("experience");
  });

  it("leaves other templates on the visitor's mode", () => {
    design.key = "luxury";
    renderScope();
    expect(screen.getByText("experience")).toBeTruthy();
  });
});
