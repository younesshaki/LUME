import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOT_PERSONA_SYSTEM_PROMPT,
  defaultBotPersonaName,
} from "./botPersona";

describe("defaultBotPersonaName", () => {
  // The regression: provisioning inserted only tenant_id, so every tenant
  // inherited the 'LUME Concierge' column default and greeted the dealer's
  // own customers with our vendor brand.
  it("brands the concierge with the tenant's name", () => {
    expect(defaultBotPersonaName("Northgate Motors")).toBe("Northgate Motors Concierge");
  });

  it("never produces the bare vendor default for a real tenant", () => {
    expect(defaultBotPersonaName("Northgate Motors")).not.toBe("LUME Concierge");
  });

  it("does not stutter when the tenant name already says concierge", () => {
    expect(defaultBotPersonaName("Alpine Concierge")).toBe("Alpine Concierge");
    expect(defaultBotPersonaName("alpine concierge")).toBe("alpine concierge");
  });

  it("trims surrounding whitespace", () => {
    expect(defaultBotPersonaName("  Bay Auto  ")).toBe("Bay Auto Concierge");
  });

  it("falls back to a neutral name when the tenant name is blank", () => {
    expect(defaultBotPersonaName("")).toBe("Concierge");
    expect(defaultBotPersonaName("   ")).toBe("Concierge");
  });
});

describe("DEFAULT_BOT_PERSONA_SYSTEM_PROMPT", () => {
  // Provisioning must seed this explicitly: the column default is '', and the
  // code-level fallback only applies when no persona row exists at all.
  it("is a non-empty instruction", () => {
    expect(DEFAULT_BOT_PERSONA_SYSTEM_PROMPT.trim().length).toBeGreaterThan(0);
  });
});
