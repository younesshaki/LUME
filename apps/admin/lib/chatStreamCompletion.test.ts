import { describe, expect, it } from "vitest";
import { isChatStreamCompletionLine } from "./chatStreamCompletion";

describe("chat stream completion", () => {
  it("recognizes explicit protocol completion markers", () => {
    expect(isChatStreamCompletionLine("data: [DONE]")).toBe(true);
    expect(isChatStreamCompletionLine(
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    )).toBe(true);
  });

  it("does not mistake partial content or a clean EOF for completion", () => {
    expect(isChatStreamCompletionLine(
      'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}',
    )).toBe(false);
    expect(isChatStreamCompletionLine("")).toBe(false);
    expect(isChatStreamCompletionLine("data: malformed")).toBe(false);
  });
});
