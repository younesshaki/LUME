import { describe, expect, it } from "vitest";
import {
  ONBOARDING_DISMISSAL_VALUE,
  isBotPersonaConfigured,
  onboardingDismissalKey,
  onboardingProgress,
  shouldHideOnboardingChecklist,
  tenantThemeHasLogo,
  type OnboardingChecklistItem,
} from "./onboardingChecklist";

function item(id: OnboardingChecklistItem["id"], complete: boolean): OnboardingChecklistItem {
  return { id, complete, label: id, href: `/admin/acme/${id}` };
}

describe("onboarding checklist state", () => {
  it("calculates bounded completion progress", () => {
    expect(onboardingProgress([
      item("logo", true),
      item("inventory", true),
      item("persona", false),
    ])).toEqual({ completed: 2, total: 3, percentage: 67, allComplete: false });
    expect(onboardingProgress([])).toEqual({
      completed: 0,
      total: 0,
      percentage: 0,
      allComplete: false,
    });
    expect(onboardingProgress([item("domain", true)])).toEqual({
      completed: 1,
      total: 1,
      percentage: 100,
      allComplete: true,
    });
  });

  it("only honors a tenant-scoped dismissal after every step is complete", () => {
    expect(onboardingDismissalKey("tenant-1")).toBe(
      "lume:onboarding-checklist:v1:tenant-1",
    );
    expect(shouldHideOnboardingChecklist(true, ONBOARDING_DISMISSAL_VALUE)).toBe(true);
    expect(shouldHideOnboardingChecklist(false, ONBOARDING_DISMISSAL_VALUE)).toBe(false);
    expect(shouldHideOnboardingChecklist(true, "unknown")).toBe(false);
  });

  it("distinguishes a provisioned persona from a configured one", () => {
    const initial = {
      name: "LUME Concierge",
      tone: "cinematic",
      system_prompt: "",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    expect(isBotPersonaConfigured(null)).toBe(false);
    expect(isBotPersonaConfigured(initial)).toBe(false);
    expect(isBotPersonaConfigured({ ...initial, tone: "warm" })).toBe(true);
    expect(isBotPersonaConfigured({ ...initial, system_prompt: "Be concise." })).toBe(true);
    expect(isBotPersonaConfigured({
      ...initial,
      updated_at: "2026-01-02T00:00:00.000Z",
    })).toBe(true);
  });

  it("recognizes logo URLs without assuming one theme shape", () => {
    expect(tenantThemeHasLogo({})).toBe(false);
    expect(tenantThemeHasLogo({ logoUrl: "  " })).toBe(false);
    expect(tenantThemeHasLogo({ branding: { logoUrl: "https://cdn.example/logo.svg" } })).toBe(
      true,
    );
    expect(tenantThemeHasLogo({ logo: { url: "/tenant/logo.png" } })).toBe(true);
  });
});
