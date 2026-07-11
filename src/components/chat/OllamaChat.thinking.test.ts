import { describe, expect, it } from "vitest";
import {
  MAX_THINKING_STEPS,
  MAX_THINKING_TEXT_LENGTH,
  appendThinkingStep,
  sanitizeThinkingText,
  snapshotThinkingSteps,
} from "./OllamaChat.thinking";

describe("appendThinkingStep", () => {
  it("appends operational steps in arrival order", () => {
    let steps: string[] = [];
    steps = appendThinkingStep(steps, "Finding the best match...");
    steps = appendThinkingStep(steps, "I checked 47 SUVs...");
    steps = appendThinkingStep(steps, "Looking at price history...");

    expect(steps).toEqual([
      "Finding the best match...",
      "I checked 47 SUVs...",
      "Looking at price history...",
    ]);
  });

  it("keeps repeated statuses because each represents an executed call", () => {
    const original = ["Finding the best match..."];
    const result = appendThinkingStep(original, "  FINDING   the best match...  ");

    expect(result).toEqual([
      "Finding the best match...",
      "FINDING the best match...",
    ]);
    expect(result).not.toBe(original);
  });

  it("retains the newest five steps", () => {
    let steps: string[] = [];
    for (let index = 1; index <= MAX_THINKING_STEPS + 2; index += 1) {
      steps = appendThinkingStep(steps, `Step ${index}`);
    }

    expect(steps).toEqual(["Step 3", "Step 4", "Step 5", "Step 6", "Step 7"]);
    expect(steps).toHaveLength(MAX_THINKING_STEPS);
  });

  it("ignores empty and non-string stream fields", () => {
    const steps = ["Searching inventory..."];
    expect(appendThinkingStep(steps, " \n\t ")).toEqual(steps);
    expect(appendThinkingStep(steps, null)).toEqual(steps);
    expect(appendThinkingStep(steps, { text: "not a string field" })).toEqual(steps);
  });
});

describe("sanitizeThinkingText", () => {
  it("collapses lines and removes control, terminal, and directional formatting", () => {
    expect(sanitizeThinkingText(
      "\u001b[31mLooking\u001b[0m\n\t at\u0000 price\u202e history...",
    )).toBe("Looking at price history...");
  });

  it("bounds text by Unicode code point without splitting emoji", () => {
    const result = sanitizeThinkingText(
      `${"a".repeat(MAX_THINKING_TEXT_LENGTH - 1)}🙂tail`,
    );

    expect(Array.from(result ?? "")).toHaveLength(MAX_THINKING_TEXT_LENGTH);
    expect(result?.endsWith("🙂")).toBe(true);
    expect(result).not.toContain("tail");
  });

  it("leaves hostile markup inert as bounded display text", () => {
    const hostile = `<script>alert("x")</script>${"x".repeat(200)}`;
    const result = sanitizeThinkingText(hostile);

    expect(result?.startsWith('<script>alert("x")</script>')).toBe(true);
    expect(Array.from(result ?? "").length).toBe(MAX_THINKING_TEXT_LENGTH);
  });
});

describe("snapshotThinkingSteps", () => {
  it("returns a separate sanitized snapshot for message attachment", () => {
    const pending = [
      "  Searching inventory...  ",
      "SEARCHING INVENTORY...",
      "\n",
      "Checking price\n history...",
    ];
    const snapshot = snapshotThinkingSteps(pending);

    expect(snapshot).toEqual([
      "Searching inventory...",
      "SEARCHING INVENTORY...",
      "Checking price history...",
    ]);
    expect(snapshot).not.toBe(pending);

    pending.push("A later pending step");
    expect(snapshot).toHaveLength(3);
  });

  it("enforces the same newest-five cap on hydrated state", () => {
    expect(snapshotThinkingSteps(["1", "2", "3", "4", "5", "6"])).toEqual([
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
  });
});
