import { describe, expect, it } from "vitest";
import { chatAssistantLabels, chatCopyFor } from "./OllamaChat.copy";

describe("chatCopyFor", () => {
  it("keeps LUME's own copy for the house tenant", () => {
    const copy = chatCopyFor("default");
    expect(copy.welcome).toContain("LUME");
    expect(copy.defaultBotName).toBe("LUME");
  });

  it("never mentions LUME on a dealership's site", () => {
    const copy = chatCopyFor("demo-arash");
    const text = [copy.welcome, copy.defaultBotName, ...copy.suggestions].join(" ");
    expect(text).not.toMatch(/LUME|products|access/i);
    expect(copy.suggestions).toContain("How do I book a test drive?");
  });
});

describe("chatAssistantLabels", () => {
  it("names the dealership once it is known", () => {
    expect(chatAssistantLabels("Arash Motors")).toEqual({
      open: "Open Arash Motors assistant",
      panel: "Arash Motors assistant",
      input: "Message Arash Motors assistant",
      placeholder: "Message Arash Motors",
    });
  });

  it("falls back to neutral labels while the name loads", () => {
    expect(Object.values(chatAssistantLabels("")).join(" ")).not.toMatch(/LUME/);
  });
});
